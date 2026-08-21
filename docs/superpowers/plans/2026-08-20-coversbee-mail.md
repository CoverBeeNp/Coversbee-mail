# CoversBee Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a staff-facing Next.js dashboard that sends transactional order-status emails and throttled marketing campaigns through Zoho Mail, backed by a shared Supabase Postgres database, using manually-pasted Blanxer order text instead of API polling.

**Architecture:** Next.js (App Router, TypeScript) on Vercel talks directly to Supabase Postgres/Auth from the browser for reads and to server-side API routes for anything touching secrets (Zoho OAuth + send). A Supabase Edge Function on pg_cron drains a `campaign_recipients` queue hourly, respecting a configurable daily send cap. All Zoho state (cached access token, connection health) lives in Postgres so it survives across stateless serverless invocations.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Supabase (Postgres, Auth, Edge Functions, pg_cron + pg_net), Zoho Mail REST API (OAuth2), Vitest for unit tests, Vercel (hosting), all free tiers.

**Spec:** `docs/superpowers/specs/2026-08-20-coversbee-mail-design.md`

## Global Constraints

- No DNS changes to coversbee.com.np — never propose custom domains, subdomain hosting, or SPF/DKIM/DMARC records.
- Zoho send only via the REST API (`https://mail.zoho.com/api/accounts/{account_id}/messages`) using OAuth2 — never SMTP.
- Zoho `client_id`/`client_secret`/`refresh_token` are server-side secrets only (Vercel/Supabase env vars) — never sent to or read from the browser.
- Daily marketing send volume must stay under the confirmed Zoho Free cap (default assumption: 200/day, configurable via `ZOHO_DAILY_CAP` env var — confirm the real number in the Zoho admin console before go-live and adjust the env var, no code change needed).
- `orders.status` changes only as a side effect of a successful transactional send — never edited directly, never inferred from Blanxer's own status text.
- Parser never guesses: unmatched fields are left blank and flagged in the confirm UI.
- Every Zoho send failure is logged to `email_log` with `status='failed'` + `error_message`, visible and retryable from the dashboard — never silently dropped.
- $0 infra cost — Vercel free tier, Supabase free tier, no paid add-ons.

---

## File Structure

```
package.json, tsconfig.json, next.config.js, vitest.config.ts, .env.example
supabase/
  migrations/
    0001_init_schema.sql
    0002_zoho_state_and_settings.sql
    0003_pg_cron_drain.sql
  functions/
    drain-campaign-queue/index.ts
lib/
  supabase/client.ts        (browser client)
  supabase/server.ts        (server client, service-role for API routes)
  parser/blanxerParser.ts
  parser/blanxerParser.test.ts
  zoho/client.ts             (token cache + refresh + sendEmail)
  zoho/client.test.ts
  zoho/templates.ts          (shared HTML shell + 4 transactional + campaign renderer)
  zoho/templates.test.ts
  segments/resolveSegment.ts
  segments/resolveSegment.test.ts
middleware.ts                 (Supabase Auth route guard)
app/
  login/page.tsx
  layout.tsx                  (zoho-broken banner)
  orders/page.tsx             (order list + status buttons)
  orders/new/page.tsx         (paste form + confirm screen)
  orders/actions.ts           (server actions: parseOrder, saveOrder)
  api/send-transactional/route.ts
  campaigns/page.tsx
  campaigns/new/page.tsx
  campaigns/[id]/page.tsx
  api/campaigns/send/route.ts
  email-log/page.tsx
  api/email-log/retry/route.ts
  api/zoho/test-send/route.ts
```

---

### Task 1: Project scaffold, Supabase schema, and local dev verification

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `vitest.config.ts`, `.env.example`
- Create: `supabase/migrations/0001_init_schema.sql`
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`

**Interfaces:**
- Produces: `createBrowserClient()` in `lib/supabase/client.ts` returning a Supabase JS client using `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Produces: `createServiceClient()` in `lib/supabase/server.ts` returning a Supabase JS client using `SUPABASE_SERVICE_ROLE_KEY` (server-only, never imported from client components).

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-git
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 2: Add `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ACCOUNT_ID=
ZOHO_FROM_ADDRESS=info@coversbee.com.np
ZOHO_DAILY_CAP=200
```

- [ ] **Step 3: Write the schema migration**

```sql
-- supabase/migrations/0001_init_schema.sql
create type order_status as enum ('received', 'dispatched', 'delivered', 'cancelled');
create type email_type as enum ('transactional', 'marketing');
create type email_status as enum ('sent', 'failed');
create type campaign_status as enum ('draft', 'sending', 'sent');

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  subscribed_to_marketing boolean not null default true,
  created_at timestamptz not null default now()
);
create index customers_phone_idx on customers (phone);
create index customers_email_idx on customers (email);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  raw_pasted_text text not null,
  parsed_items jsonb not null default '[]',
  total numeric,
  status order_status not null default 'received',
  blanxer_order_number text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);
create index orders_customer_id_idx on orders (customer_id);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_id uuid not null references customers(id),
  type email_type not null,
  template_used text not null,
  status email_status not null,
  zoho_message_id text,
  sent_at timestamptz not null default now(),
  error_message text
);
create index email_log_customer_id_idx on email_log (customer_id);
create index email_log_status_idx on email_log (status);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body_template text not null,
  segment_filter jsonb not null default '{"type":"all_subscribed"}',
  status campaign_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table campaign_recipients (
  campaign_id uuid not null references campaigns(id),
  customer_id uuid not null references customers(id),
  status text not null default 'queued',
  sent_at timestamptz,
  primary key (campaign_id, customer_id)
);

alter table customers enable row level security;
alter table orders enable row level security;
alter table email_log enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;

create policy "authenticated full access" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on email_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on campaigns for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on campaign_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

- [ ] **Step 4: Write the Supabase client helpers**

```typescript
// lib/supabase/client.ts
import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

export function createBrowserClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 5: Apply migration and verify locally**

Run: `npx supabase init && npx supabase start && npx supabase db push`
Expected: all five tables + enums created with no errors; `npx supabase db reset` re-applies cleanly.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json next.config.js vitest.config.ts .env.example supabase/migrations/0001_init_schema.sql lib/supabase
git commit -m "chore: scaffold Next.js app and initial Supabase schema"
```

---

### Task 2: Staff login and route guard

**Files:**
- Create: `app/login/page.tsx`
- Create: `middleware.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `createBrowserClient()` from Task 1.
- Produces: unauthenticated requests to any `/orders`, `/campaigns`, `/email-log` route redirect to `/login`.

- [ ] **Step 1: Write the middleware route guard**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => response.cookies.set(name, value, options),
        remove: (name, options) => response.cookies.set(name, '', { ...options, maxAge: 0 }),
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

export const config = { matcher: ['/orders/:path*', '/campaigns/:path*', '/email-log/:path*'] }
```

- [ ] **Step 2: Write the login page**

```tsx
// app/login/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    router.push('/orders')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Log in</button>
    </form>
  )
}
```

- [ ] **Step 3: Manual verification**

Run: create a staff user via `npx supabase auth users create` (or the Supabase Studio Auth panel) with a test email/password, then `npm run dev`.
Expected: visiting `/orders` while logged out redirects to `/login`; logging in with the test user redirects to `/orders` and stays there on reload.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/login/page.tsx app/layout.tsx
git commit -m "feat: add staff login and auth route guard"
```

---

### Task 3: Zoho OAuth client and test-send endpoint

**Files:**
- Create: `supabase/migrations/0002_zoho_state_and_settings.sql`
- Create: `lib/zoho/client.ts`, `lib/zoho/client.test.ts`
- Create: `app/api/zoho/test-send/route.ts`

**Interfaces:**
- Consumes: `createServiceClient()` from Task 1.
- Produces: `getAccessToken(): Promise<string>` — returns a cached or freshly-refreshed Zoho access token, throws `ZohoAuthError` on refresh failure and marks `system_status.zoho_connected = false`.
- Produces: `sendEmail({ to, subject, htmlBody }): Promise<{ messageId: string }>` — throws `ZohoSendError` with a `.message` describing the Zoho API failure on non-2xx response.

- [ ] **Step 1: Migration for Zoho token cache and system status**

```sql
-- supabase/migrations/0002_zoho_state_and_settings.sql
create table zoho_oauth_state (
  id boolean primary key default true,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint zoho_oauth_state_singleton check (id)
);
insert into zoho_oauth_state (id) values (true);

create table system_status (
  id boolean primary key default true,
  zoho_connected boolean not null default true,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint system_status_singleton check (id)
);
insert into system_status (id) values (true);

create table test_recipients (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table zoho_oauth_state enable row level security;
alter table system_status enable row level security;
alter table test_recipients enable row level security;
create policy "authenticated read" on system_status for select using (auth.role() = 'authenticated');
create policy "authenticated full access" on test_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write the failing test for token caching and refresh**

```typescript
// lib/zoho/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAccessToken, ZohoAuthError } from './client'

function mockSupabase(row: { access_token: string | null; expires_at: string | null }) {
  return {
    from: () => ({
      select: () => ({ single: async () => ({ data: row, error: null }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }
}

describe('getAccessToken', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns the cached token when not expired', async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'cached-token', expires_at: futureExpiry })
    const fetchSpy = vi.spyOn(global, 'fetch')
    const token = await getAccessToken(supabase as any)
    expect(token).toBe('cached-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes and returns a new token when expired', async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'stale-token', expires_at: pastExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-token', expires_in: 3600 }),
    } as Response)
    const token = await getAccessToken(supabase as any)
    expect(token).toBe('fresh-token')
  })

  it('throws ZohoAuthError when refresh fails', async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'stale-token', expires_at: pastExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) } as Response)
    await expect(getAccessToken(supabase as any)).rejects.toThrow(ZohoAuthError)
  })
})
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npx vitest run lib/zoho/client.test.ts`
Expected: FAIL — `./client` has no exported member `getAccessToken`.

- [ ] **Step 3: Implement the Zoho client**

```typescript
// lib/zoho/client.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export class ZohoAuthError extends Error {}
export class ZohoSendError extends Error {}

export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: row } = await supabase.from('zoho_oauth_state').select('access_token, expires_at').single()

  if (row?.access_token && row.expires_at && new Date(row.expires_at) > new Date()) {
    return row.access_token
  }

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: 'POST' })

  if (!response.ok) {
    await supabase.from('system_status').update({ zoho_connected: false, last_error: 'Zoho token refresh failed', updated_at: new Date().toISOString() }).eq('id', true)
    throw new ZohoAuthError('Zoho OAuth refresh failed — reconnect Zoho')
  }

  const body = await response.json()
  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
  await supabase.from('zoho_oauth_state').update({ access_token: body.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', true)
  await supabase.from('system_status').update({ zoho_connected: true, last_error: null, updated_at: new Date().toISOString() }).eq('id', true)
  return body.access_token
}

export async function sendEmail(
  supabase: SupabaseClient,
  { to, subject, htmlBody }: { to: string; subject: string; htmlBody: string }
): Promise<{ messageId: string }> {
  const token = await getAccessToken(supabase)
  const response = await fetch(
    `https://mail.zoho.com/api/accounts/${process.env.ZOHO_ACCOUNT_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromAddress: process.env.ZOHO_FROM_ADDRESS,
        toAddress: to,
        subject,
        content: htmlBody,
        mailFormat: 'html',
      }),
    }
  )

  const payload = await response.json()
  if (!response.ok) {
    throw new ZohoSendError(payload?.data?.moreInfo ?? payload?.message ?? `Zoho send failed with status ${response.status}`)
  }
  return { messageId: payload.data.messageId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/zoho/client.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the test-send API route**

```typescript
// app/api/zoho/test-send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, ZohoAuthError, ZohoSendError } from '@/lib/zoho/client'

export async function POST(request: NextRequest) {
  const { to } = await request.json()
  const supabase = createServiceClient()
  try {
    const result = await sendEmail(supabase, { to, subject: 'CoversBee Mail test', htmlBody: '<p>This is a test email from CoversBee Mail.</p>' })
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    const status = err instanceof ZohoAuthError ? 401 : err instanceof ZohoSendError ? 502 : 500
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}
```

- [ ] **Step 6: Manual end-to-end verification**

Register the OAuth client at api-console.zoho.com (Self Client, scope `ZohoMail.messages.CREATE`), generate a refresh token, set the six `ZOHO_*` env vars locally, run `npm run dev`, then:
Run: `curl -X POST http://localhost:3000/api/zoho/test-send -H "Content-Type: application/json" -d '{"to":"<your-personal-email>"}'`
Expected: `{"ok":true,"messageId":"..."}` and the test email arrives in the inbox.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_zoho_state_and_settings.sql lib/zoho/client.ts lib/zoho/client.test.ts app/api/zoho/test-send
git commit -m "feat: add Zoho OAuth client and test-send endpoint"
```

---

### Task 4: Blanxer paste parser

**Files:**
- Create: `lib/parser/blanxerParser.ts`, `lib/parser/blanxerParser.test.ts`

**Interfaces:**
- Produces:
```typescript
type ParsedItem = { name: string; variant: string | null; unitPrice: number; qty: number; lineTotal: number }
type ParsedOrder = {
  blanxerOrderNumber: string | null
  items: ParsedItem[]
  subtotal: number | null
  deliveryCharge: number | null
  total: number | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  province: string | null
  city: string | null
  address: string | null
  landmark: string | null
  orderNote: string | null
  unmatchedFields: string[]
}
function parseBlanxerOrder(rawText: string): ParsedOrder
```

- [ ] **Step 1: Write the failing test using the confirmed sample**

```typescript
// lib/parser/blanxerParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseBlanxerOrder } from './blanxerParser'

const sample = `#1747
Created: Aug 20, 2026 2:50 AM
Modified: Aug 20, 2026 8:25 AM
Tracking URL:
https://coversbee.com.np/track/6a86b1ab454b1a6bfa9d2c73
Status:
Delivery_Transit
&
Unpaid
Payment Method: COD
Created By: Yaman Subedi

Order Summary
Cart Items
1
SIlicon
Variant: Old Rose/iPhone 13
रू 799 x 1
रू 799
1
SIlicon
Variant: Old Rose/iPhone 13Promax
रू 799 x 1
रू 799
Sub-total
रू 1,598
Delivery Charge
रू 170
Total
रू 1,768

Customer Details
Name:
Nees shah
Email:
grgbini898@gmail.com
Phone Number:
9709956477
Province:
City:
Kathmandu Inside Ring Road
Address:
Dulal chowk, Kapan
Landmark:
Order Note:
`

describe('parseBlanxerOrder', () => {
  it('extracts order number, items, totals, and customer fields', () => {
    const result = parseBlanxerOrder(sample)
    expect(result.blanxerOrderNumber).toBe('1747')
    expect(result.items).toEqual([
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 },
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13Promax', unitPrice: 799, qty: 1, lineTotal: 799 },
    ])
    expect(result.subtotal).toBe(1598)
    expect(result.deliveryCharge).toBe(170)
    expect(result.total).toBe(1768)
    expect(result.customerName).toBe('Nees shah')
    expect(result.customerEmail).toBe('grgbini898@gmail.com')
    expect(result.customerPhone).toBe('9709956477')
    expect(result.city).toBe('Kathmandu Inside Ring Road')
    expect(result.address).toBe('Dulal chowk, Kapan')
  })

  it('leaves blank customer fields blank instead of guessing', () => {
    const result = parseBlanxerOrder(sample)
    expect(result.province).toBeNull()
    expect(result.landmark).toBeNull()
    expect(result.orderNote).toBeNull()
  })

  it('flags unmatched required fields when the paste is garbled', () => {
    const result = parseBlanxerOrder('this is not a valid blanxer paste at all')
    expect(result.customerName).toBeNull()
    expect(result.total).toBeNull()
    expect(result.unmatchedFields).toEqual(expect.arrayContaining(['customerName', 'total']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/parser/blanxerParser.test.ts`
Expected: FAIL — `./blanxerParser` has no exported member `parseBlanxerOrder`.

- [ ] **Step 3: Implement the parser**

```typescript
// lib/parser/blanxerParser.ts
export type ParsedItem = { name: string; variant: string | null; unitPrice: number; qty: number; lineTotal: number }
export type ParsedOrder = {
  blanxerOrderNumber: string | null
  items: ParsedItem[]
  subtotal: number | null
  deliveryCharge: number | null
  total: number | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  province: string | null
  city: string | null
  address: string | null
  landmark: string | null
  orderNote: string | null
  unmatchedFields: string[]
}

function toNumber(line: string | undefined): number | null {
  if (!line) return null
  const match = line.match(/रू\s*([\d,]+)/)
  if (!match) return null
  return Number(match[1].replace(/,/g, ''))
}

function labelValue(lines: string[], label: string): string | null {
  const idx = lines.findIndex((l) => l.trim() === label)
  if (idx === -1 || idx + 1 >= lines.length) return null
  const value = lines[idx + 1].trim()
  return value === '' ? null : value
}

export function parseBlanxerOrder(rawText: string): ParsedOrder {
  const lines = rawText.split('\n').map((l) => l.trim())
  const unmatchedFields: string[] = []

  const orderNumberMatch = rawText.match(/^#(\d+)/m)
  const blanxerOrderNumber = orderNumberMatch ? orderNumberMatch[1] : null

  const cartStart = lines.findIndex((l) => l === 'Cart Items')
  const subtotalIdx = lines.findIndex((l) => l === 'Sub-total')
  const items: ParsedItem[] = []
  if (cartStart !== -1 && subtotalIdx !== -1) {
    let i = cartStart + 1
    while (i < subtotalIdx) {
      if (!/^\d+$/.test(lines[i])) { i++; continue }
      i++ // skip qty line
      const name = lines[i++] ?? ''
      let variant: string | null = null
      if (lines[i]?.startsWith('Variant:')) {
        variant = lines[i].replace('Variant:', '').trim()
        i++
      }
      const priceLine = lines[i++] ?? ''
      const priceMatch = priceLine.match(/रू\s*([\d,]+)\s*x\s*(\d+)/)
      const unitPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0
      const qty = priceMatch ? Number(priceMatch[2]) : 0
      const lineTotal = toNumber(lines[i++]) ?? 0
      items.push({ name, variant, unitPrice, qty, lineTotal })
    }
  }

  const subtotal = toNumber(lines[subtotalIdx + 1])
  const deliveryIdx = lines.findIndex((l) => l === 'Delivery Charge')
  const deliveryCharge = toNumber(lines[deliveryIdx + 1])
  const totalIdx = lines.findIndex((l) => l === 'Total')
  const total = toNumber(lines[totalIdx + 1])

  const customerName = labelValue(lines, 'Name:')
  const customerEmail = labelValue(lines, 'Email:')
  const customerPhone = labelValue(lines, 'Phone Number:')
  const province = labelValue(lines, 'Province:')
  const city = labelValue(lines, 'City:')
  const address = labelValue(lines, 'Address:')
  const landmark = labelValue(lines, 'Landmark:')
  const orderNote = labelValue(lines, 'Order Note:')

  if (customerName === null) unmatchedFields.push('customerName')
  if (total === null) unmatchedFields.push('total')

  return {
    blanxerOrderNumber, items, subtotal, deliveryCharge, total,
    customerName, customerEmail, customerPhone, province, city, address, landmark, orderNote,
    unmatchedFields,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/parser/blanxerParser.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/parser
git commit -m "feat: add Blanxer order paste parser"
```

---

### Task 5: Order paste form, confirm screen, and save

**Files:**
- Create: `app/orders/new/page.tsx`
- Create: `app/orders/actions.ts`

**Interfaces:**
- Consumes: `parseBlanxerOrder` (Task 4), `createServiceClient()` (Task 1).
- Produces: server action `saveOrder(input: { rawPastedText: string; parsed: ParsedOrder }): Promise<{ orderId: string }>` — upserts `customers` (matched by phone, falling back to email) and inserts `orders` with `status='received'`.

- [ ] **Step 1: Write the server actions**

```typescript
// app/orders/actions.ts
'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBlanxerOrder, type ParsedOrder } from '@/lib/parser/blanxerParser'

export async function parseOrder(rawText: string): Promise<ParsedOrder> {
  return parseBlanxerOrder(rawText)
}

export async function saveOrder(input: { rawPastedText: string; parsed: ParsedOrder }) {
  const supabase = createServiceClient()
  const { parsed, rawPastedText } = input

  let customerId: string
  const existing = parsed.customerPhone
    ? await supabase.from('customers').select('id').eq('phone', parsed.customerPhone).maybeSingle()
    : parsed.customerEmail
    ? await supabase.from('customers').select('id').eq('email', parsed.customerEmail).maybeSingle()
    : { data: null }

  if (existing.data) {
    customerId = existing.data.id
  } else {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({ name: parsed.customerName ?? 'Unknown', phone: parsed.customerPhone, email: parsed.customerEmail })
      .select('id')
      .single()
    if (error) throw error
    customerId = created.id
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: customerId,
      raw_pasted_text: rawPastedText,
      parsed_items: parsed.items,
      total: parsed.total,
      status: 'received',
      blanxer_order_number: parsed.blanxerOrderNumber,
    })
    .select('id')
    .single()
  if (orderError) throw orderError

  return { orderId: order.id }
}
```

- [ ] **Step 2: Write the paste + confirm UI**

```tsx
// app/orders/new/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseOrder, saveOrder } from '../actions'
import type { ParsedOrder } from '@/lib/parser/blanxerParser'

export default function NewOrderPage() {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedOrder | null>(null)
  const router = useRouter()

  async function handleParse() {
    setParsed(await parseOrder(rawText))
  }

  async function handleSave() {
    if (!parsed) return
    const { orderId } = await saveOrder({ rawPastedText: rawText, parsed })
    router.push(`/orders/${orderId}`)
  }

  function updateField<K extends keyof ParsedOrder>(key: K, value: ParsedOrder[K]) {
    if (!parsed) return
    setParsed({ ...parsed, [key]: value })
  }

  if (!parsed) {
    return (
      <div>
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={20} placeholder="Paste the Blanxer order page text here" />
        <button onClick={handleParse}>Parse</button>
      </div>
    )
  }

  return (
    <div>
      <div>
        <h2>Confirm order details</h2>
        {(['customerName', 'customerEmail', 'customerPhone', 'city', 'address'] as const).map((field) => (
          <label key={field}>
            {field} {parsed.unmatchedFields.includes(field) && <strong>(needs review)</strong>}
            <input value={parsed[field] ?? ''} onChange={(e) => updateField(field, e.target.value as any)} />
          </label>
        ))}
        <p>Total: {parsed.total ?? <strong>(needs review)</strong>}</p>
        <ul>{parsed.items.map((item, i) => <li key={i}>{item.name} {item.variant} x{item.qty} — {item.lineTotal}</li>)}</ul>
        <button onClick={handleSave}>Save order</button>
      </div>
      <pre>{rawText}</pre>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in, go to `/orders/new`, paste the sample text from Task 4's test, click Parse.
Expected: confirm screen shows Nees shah / grgbini898@gmail.com / 9709956477 / Kathmandu Inside Ring Road / Dulal chowk, Kapan, total 1768, two cart items, raw text visible alongside. Click Save order → redirected to `/orders/<id>` (stub page is fine until Task 6) and a row exists in `customers` and `orders` in Supabase Studio.

- [ ] **Step 4: Commit**

```bash
git add app/orders/new app/orders/actions.ts
git commit -m "feat: add order paste form with confirm-before-save"
```

---

### Task 6: Order list, transactional templates, and status-send buttons

**Files:**
- Create: `lib/zoho/templates.ts`, `lib/zoho/templates.test.ts`
- Create: `app/orders/page.tsx`, `app/orders/[id]/page.tsx`
- Create: `app/api/send-transactional/route.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 3).
- Produces: `renderTransactionalEmail(status: OrderStatus, order: { blanxerOrderNumber: string | null; items: ParsedItem[]; total: number | null; customerName: string | null }): { subject: string; html: string }`.
- Produces: `POST /api/send-transactional { orderId, status }` — sends the matching template, and only on success updates `orders.status`/`status_updated_at` and inserts an `email_log` row (`status='sent'`); on failure inserts an `email_log` row with `status='failed'` + `error_message` and leaves `orders.status` unchanged.

- [ ] **Step 1: Write the failing test for template rendering**

```typescript
// lib/zoho/templates.test.ts
import { describe, it, expect } from 'vitest'
import { renderTransactionalEmail } from './templates'

describe('renderTransactionalEmail', () => {
  it('renders a subject and HTML body referencing the order number', () => {
    const { subject, html } = renderTransactionalEmail('dispatched', {
      blanxerOrderNumber: '1747', items: [{ name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 }],
      total: 1768, customerName: 'Nees shah',
    })
    expect(subject).toContain('1747')
    expect(html).toContain('Nees shah')
    expect(html).toContain('SIlicon')
    expect(html).toContain('1768')
  })

  for (const status of ['received', 'dispatched', 'delivered', 'cancelled'] as const) {
    it(`has a template for status "${status}"`, () => {
      const { subject } = renderTransactionalEmail(status, { blanxerOrderNumber: '1', items: [], total: 0, customerName: 'Test' })
      expect(subject.length).toBeGreaterThan(0)
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/zoho/templates.test.ts`
Expected: FAIL — `./templates` has no exported member `renderTransactionalEmail`.

- [ ] **Step 3: Implement the shared shell and templates**

```typescript
// lib/zoho/templates.ts
import type { ParsedItem } from '@/lib/parser/blanxerParser'
import type { OrderStatus } from '@/lib/types'

function shell(bodyHtml: string): string {
  return `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background:#7a2e2e; color:#fff; padding:16px; text-align:center;">
      <strong>CoversBee</strong>
    </div>
    <div style="padding:24px;">${bodyHtml}</div>
    <div style="padding:16px; font-size:12px; color:#888; text-align:center;">
      coversbee.com.np — <a href="mailto:info@coversbee.com.np?subject=Unsubscribe">Unsubscribe</a>
    </div>
  </div>`
}

function itemsHtml(items: ParsedItem[]): string {
  return `<ul>${items.map((i) => `<li>${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.qty} — रू ${i.lineTotal}</li>`).join('')}</ul>`
}

const COPY: Record<OrderStatus, { subjectPrefix: string; message: string }> = {
  received: { subjectPrefix: 'Order received', message: 'We have received your order.' },
  dispatched: { subjectPrefix: 'Order dispatched', message: 'Your order is on its way.' },
  delivered: { subjectPrefix: 'Order delivered', message: 'Your order has been delivered. Thank you for shopping with us!' },
  cancelled: { subjectPrefix: 'Order cancelled', message: 'Your order has been cancelled.' },
}

export function renderTransactionalEmail(
  status: OrderStatus,
  order: { blanxerOrderNumber: string | null; items: ParsedItem[]; total: number | null; customerName: string | null }
): { subject: string; html: string } {
  const copy = COPY[status]
  const subject = `${copy.subjectPrefix} — Order #${order.blanxerOrderNumber ?? ''}`.trim()
  const html = shell(`
    <p>Hi ${order.customerName ?? 'there'},</p>
    <p>${copy.message}</p>
    ${itemsHtml(order.items)}
    <p><strong>Total: रू ${order.total ?? ''}</strong></p>
  `)
  return { subject, html }
}

export function renderCampaignEmail(subject: string, bodyHtml: string): { subject: string; html: string } {
  return { subject, html: shell(bodyHtml) }
}
```

```typescript
// lib/types.ts
export type OrderStatus = 'received' | 'dispatched' | 'delivered' | 'cancelled'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/zoho/templates.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the send-transactional API route**

```typescript
// app/api/send-transactional/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/zoho/client'
import { renderTransactionalEmail } from '@/lib/zoho/templates'
import type { OrderStatus } from '@/lib/types'

export async function POST(request: NextRequest) {
  const { orderId, status } = (await request.json()) as { orderId: string; status: OrderStatus }
  const supabase = createServiceClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, parsed_items, total, customer_id, customers(name, email)')
    .eq('id', orderId)
    .single()
  if (error || !order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

  const customer = (order as any).customers
  const { subject, html } = renderTransactionalEmail(status, {
    blanxerOrderNumber: order.blanxer_order_number,
    items: order.parsed_items as any,
    total: order.total,
    customerName: customer?.name ?? null,
  })

  try {
    if (!customer?.email) throw new Error('Customer has no email on file')
    const result = await sendEmail(supabase, { to: customer.email, subject, htmlBody: html })
    await supabase.from('orders').update({ status, status_updated_at: new Date().toISOString() }).eq('id', orderId)
    await supabase.from('email_log').insert({
      order_id: orderId, customer_id: order.customer_id, type: 'transactional',
      template_used: status, status: 'sent', zoho_message_id: result.messageId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await supabase.from('email_log').insert({
      order_id: orderId, customer_id: order.customer_id, type: 'transactional',
      template_used: status, status: 'failed', error_message: (err as Error).message,
    })
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
```

- [ ] **Step 6: Write the order list and detail pages**

```tsx
// app/orders/page.tsx
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

export default async function OrdersPage() {
  const supabase = createServiceClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, status, total, customers(name)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <Link href="/orders/new">+ New order</Link>
      <table>
        <tbody>
          {orders?.map((o: any) => (
            <tr key={o.id}>
              <td><Link href={`/orders/${o.id}`}>#{o.blanxer_order_number}</Link></td>
              <td>{o.customers?.name}</td>
              <td>{o.status}</td>
              <td>{o.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

```tsx
// app/orders/[id]/page.tsx
'use client'
import { useState } from 'react'
import type { OrderStatus } from '@/lib/types'

const STATUSES: OrderStatus[] = ['received', 'dispatched', 'delivered', 'cancelled']

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [sending, setSending] = useState<OrderStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function sendStatus(status: OrderStatus) {
    setSending(status)
    setMessage(null)
    const res = await fetch('/api/send-transactional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: params.id, status }),
    })
    const body = await res.json()
    setMessage(body.ok ? `Sent "${status}" email.` : `Failed: ${body.error}`)
    setSending(null)
  }

  return (
    <div>
      {STATUSES.map((status) => (
        <button key={status} disabled={sending !== null} onClick={() => sendStatus(status)}>
          {sending === status ? 'Sending…' : `Send ${status[0].toUpperCase()}${status.slice(1)}`}
        </button>
      ))}
      {message && <p>{message}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the order saved in Task 5, click "Send Received".
Expected: transactional email arrives at the customer's inbox with order number/items/total; `orders.status` becomes `received` in Supabase Studio; a `sent` row appears in `email_log`. Temporarily break `ZOHO_ACCOUNT_ID` and retry to confirm a `failed` row is logged and `orders.status` does not change.

- [ ] **Step 8: Commit**

```bash
git add lib/zoho/templates.ts lib/zoho/templates.test.ts lib/types.ts app/orders app/api/send-transactional
git commit -m "feat: add transactional email templates, order list, and status-send buttons"
```

---

### Task 7: Campaign builder, segment resolution, and queued send

**Files:**
- Create: `lib/segments/resolveSegment.ts`, `lib/segments/resolveSegment.test.ts`
- Create: `app/campaigns/page.tsx`, `app/campaigns/new/page.tsx`
- Create: `app/api/campaigns/send/route.ts`

**Interfaces:**
- Produces: `type SegmentFilter = { type: 'all_subscribed' } | { type: 'recent_customers'; days: number }`.
- Produces: `matchesSegment(customer: { subscribedToMarketing: boolean; lastOrderAt: string | null }, filter: SegmentFilter, now: Date): boolean` — pure predicate, unit tested.
- Produces: `POST /api/campaigns/send { campaignId, testMode: boolean }` — resolves the segment (or the `test_recipients` table when `testMode` is true), inserts `campaign_recipients` rows with `status='queued'`, and sets `campaigns.status='sending'`. Does not call Zoho directly — sending happens in Task 8's drain function.

- [ ] **Step 1: Write the failing test for the segment predicate**

```typescript
// lib/segments/resolveSegment.test.ts
import { describe, it, expect } from 'vitest'
import { matchesSegment } from './resolveSegment'

describe('matchesSegment', () => {
  const now = new Date('2026-08-20T00:00:00Z')

  it('all_subscribed matches only subscribed customers', () => {
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: null }, { type: 'all_subscribed' }, now)).toBe(true)
    expect(matchesSegment({ subscribedToMarketing: false, lastOrderAt: null }, { type: 'all_subscribed' }, now)).toBe(false)
  })

  it('recent_customers matches subscribed customers with an order within N days', () => {
    const filter = { type: 'recent_customers' as const, days: 30 }
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: '2026-08-01T00:00:00Z' }, filter, now)).toBe(true)
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: '2026-01-01T00:00:00Z' }, filter, now)).toBe(false)
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: null }, filter, now)).toBe(false)
    expect(matchesSegment({ subscribedToMarketing: false, lastOrderAt: '2026-08-01T00:00:00Z' }, filter, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/segments/resolveSegment.test.ts`
Expected: FAIL — `./resolveSegment` has no exported member `matchesSegment`.

- [ ] **Step 3: Implement the predicate and the DB-backed resolver**

```typescript
// lib/segments/resolveSegment.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type SegmentFilter = { type: 'all_subscribed' } | { type: 'recent_customers'; days: number }

export function matchesSegment(
  customer: { subscribedToMarketing: boolean; lastOrderAt: string | null },
  filter: SegmentFilter,
  now: Date
): boolean {
  if (!customer.subscribedToMarketing) return false
  if (filter.type === 'all_subscribed') return true
  if (!customer.lastOrderAt) return false
  const cutoff = new Date(now.getTime() - filter.days * 24 * 60 * 60 * 1000)
  return new Date(customer.lastOrderAt) >= cutoff
}

export async function resolveSegmentCustomerIds(supabase: SupabaseClient, filter: SegmentFilter): Promise<string[]> {
  const { data: customers } = await supabase.from('customers').select('id, subscribed_to_marketing')
  const { data: orders } = await supabase.from('orders').select('customer_id, created_at').order('created_at', { ascending: false })

  const lastOrderByCustomer = new Map<string, string>()
  for (const order of orders ?? []) {
    if (!lastOrderByCustomer.has(order.customer_id)) lastOrderByCustomer.set(order.customer_id, order.created_at)
  }

  const now = new Date()
  return (customers ?? [])
    .filter((c) => matchesSegment({ subscribedToMarketing: c.subscribed_to_marketing, lastOrderAt: lastOrderByCustomer.get(c.id) ?? null }, filter, now))
    .map((c) => c.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/segments/resolveSegment.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Write the campaign send API route**

```typescript
// app/api/campaigns/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSegmentCustomerIds } from '@/lib/segments/resolveSegment'

export async function POST(request: NextRequest) {
  const { campaignId, testMode } = (await request.json()) as { campaignId: string; testMode: boolean }
  const supabase = createServiceClient()

  const { data: campaign, error } = await supabase.from('campaigns').select('id, segment_filter').eq('id', campaignId).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 })

  let customerIds: string[]
  if (testMode) {
    const { data: testEmails } = await supabase.from('test_recipients').select('email')
    const { data: matchingCustomers } = await supabase.from('customers').select('id').in('email', (testEmails ?? []).map((r) => r.email))
    customerIds = (matchingCustomers ?? []).map((c) => c.id)
  } else {
    customerIds = await resolveSegmentCustomerIds(supabase, campaign.segment_filter)
  }

  if (customerIds.length === 0) return NextResponse.json({ ok: false, error: 'No recipients matched' }, { status: 400 })

  await supabase.from('campaign_recipients').insert(customerIds.map((customerId) => ({ campaign_id: campaignId, customer_id: customerId, status: 'queued' })))
  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)

  return NextResponse.json({ ok: true, queued: customerIds.length })
}
```

- [ ] **Step 6: Write the campaign list and builder pages**

```tsx
// app/campaigns/new/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segmentType, setSegmentType] = useState<'all_subscribed' | 'recent_customers'>('all_subscribed')
  const router = useRouter()

  async function handleSave() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name, subject, body_template: body, segment_filter: { type: segmentType } })
      .select('id')
      .single()
    if (!error && data) router.push(`/campaigns/${data.id}`)
  }

  return (
    <div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Body HTML" />
      <select value={segmentType} onChange={(e) => setSegmentType(e.target.value as any)}>
        <option value="all_subscribed">All subscribed customers</option>
        <option value="recent_customers">Recent customers (last 30 days)</option>
      </select>
      <button onClick={handleSave}>Save draft</button>
    </div>
  )
}
```

```tsx
// app/campaigns/page.tsx
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

export default async function CampaignsPage() {
  const supabase = createServiceClient()
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, status, created_at').order('created_at', { ascending: false })
  return (
    <div>
      <Link href="/campaigns/new">+ New campaign</Link>
      <ul>{campaigns?.map((c) => <li key={c.id}><Link href={`/campaigns/${c.id}`}>{c.name}</Link> — {c.status}</li>)}</ul>
    </div>
  )
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, add your own email to `test_recipients` via Supabase Studio, create a campaign, open it, and trigger `POST /api/campaigns/send { campaignId, testMode: true }` via a button or curl.
Expected: `campaign_recipients` gets one `queued` row for your test customer, `campaigns.status` becomes `sending`.

- [ ] **Step 8: Commit**

```bash
git add lib/segments app/campaigns app/api/campaigns/send
git commit -m "feat: add campaign builder, segment resolution, and queued send"
```

---

### Task 8: Scheduled drain function (throttled campaign sending)

**Files:**
- Create: `supabase/functions/drain-campaign-queue/index.ts`
- Create: `supabase/migrations/0003_pg_cron_drain.sql`

**Interfaces:**
- Consumes: `sendEmail` logic (ported to Deno — Zoho client is small enough to duplicate directly in the Edge Function rather than sharing a Node module across runtimes), `renderCampaignEmail` shape from Task 6.
- Produces: an Edge Function that, per invocation, sends at most `ZOHO_DAILY_CAP - (marketing emails already sent today)` queued recipients, updates `campaign_recipients.status`/`sent_at`, writes `email_log`, and flips `campaigns.status` to `sent` once a campaign has no `queued` rows left.

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/drain-campaign-queue/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DAILY_CAP = Number(Deno.env.get('ZOHO_DAILY_CAP') ?? '200')

async function getAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: row } = await supabase.from('zoho_oauth_state').select('access_token, expires_at').single()
  if (row?.access_token && row.expires_at && new Date(row.expires_at) > new Date()) return row.access_token

  const params = new URLSearchParams({
    refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN')!,
    client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
    client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
    grant_type: 'refresh_token',
  })
  const res = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: 'POST' })
  if (!res.ok) {
    await supabase.from('system_status').update({ zoho_connected: false, last_error: 'Zoho token refresh failed', updated_at: new Date().toISOString() }).eq('id', true)
    throw new Error('Zoho OAuth refresh failed')
  }
  const body = await res.json()
  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
  await supabase.from('zoho_oauth_state').update({ access_token: body.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', true)
  return body.access_token
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const { count: sentToday } = await supabase
    .from('email_log').select('*', { count: 'exact', head: true })
    .eq('type', 'marketing').eq('status', 'sent').gte('sent_at', startOfDay.toISOString())

  const remaining = DAILY_CAP - (sentToday ?? 0)
  if (remaining <= 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'daily cap reached' }))

  const { data: queued } = await supabase
    .from('campaign_recipients')
    .select('campaign_id, customer_id, campaigns(subject, body_template), customers(email)')
    .eq('status', 'queued')
    .limit(remaining)

  let sentCount = 0
  for (const row of queued ?? []) {
    const campaign = (row as any).campaigns
    const customer = (row as any).customers
    try {
      if (!customer?.email) throw new Error('Customer has no email on file')
      const token = await getAccessToken(supabase)
      const res = await fetch(`https://mail.zoho.com/api/accounts/${Deno.env.get('ZOHO_ACCOUNT_ID')}/messages`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress: Deno.env.get('ZOHO_FROM_ADDRESS'), toAddress: customer.email, subject: campaign.subject, content: campaign.body_template, mailFormat: 'html' }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.data?.moreInfo ?? `Zoho send failed with status ${res.status}`)

      await supabase.from('campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', row.campaign_id).eq('customer_id', row.customer_id)
      await supabase.from('email_log').insert({ customer_id: row.customer_id, type: 'marketing', template_used: row.campaign_id, status: 'sent', zoho_message_id: payload.data.messageId })
      sentCount++
    } catch (err) {
      await supabase.from('campaign_recipients').update({ status: 'failed' }).eq('campaign_id', row.campaign_id).eq('customer_id', row.customer_id)
      await supabase.from('email_log').insert({ customer_id: row.customer_id, type: 'marketing', template_used: row.campaign_id, status: 'failed', error_message: (err as Error).message })
    }
  }

  const { data: distinctCampaigns } = await supabase.from('campaign_recipients').select('campaign_id').eq('status', 'queued')
  const stillQueuedCampaignIds = new Set((distinctCampaigns ?? []).map((r) => r.campaign_id))
  const { data: sendingCampaigns } = await supabase.from('campaigns').select('id').eq('status', 'sending')
  for (const c of sendingCampaigns ?? []) {
    if (!stillQueuedCampaignIds.has(c.id)) await supabase.from('campaigns').update({ status: 'sent' }).eq('id', c.id)
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }))
})
```

- [ ] **Step 2: Migration to schedule the drain via pg_cron + pg_net**

```sql
-- supabase/migrations/0003_pg_cron_drain.sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'drain-campaign-queue',
  '0 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.drain_function_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
  $$
);
```

- [ ] **Step 3: Deploy and manual verification**

Run: `npx supabase functions deploy drain-campaign-queue --no-verify-jwt`, set the `ZOHO_*` and `SUPABASE_*` secrets via `npx supabase secrets set`, then set the two `app.settings.*` config values (function URL, service role key) via `alter database postgres set app.settings.drain_function_url = '...'` in Supabase Studio SQL editor.
Run: `curl -X POST <function-url> -H "Authorization: Bearer <service-role-key>"`
Expected: with the test-mode queued recipient from Task 7 in place, the response reports `sent: 1`; the test email arrives; `campaign_recipients.status` becomes `sent`; `campaigns.status` becomes `sent` once no rows remain queued.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/drain-campaign-queue supabase/migrations/0003_pg_cron_drain.sql
git commit -m "feat: add hourly throttled campaign queue drain via pg_cron"
```

---

### Task 9: Send history, retry, and Zoho-broken banner

**Files:**
- Create: `app/email-log/page.tsx`
- Create: `app/api/email-log/retry/route.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `sendEmail` (Task 3), `renderTransactionalEmail`/`renderCampaignEmail` (Task 6).
- Produces: `POST /api/email-log/retry { emailLogId }` — re-sends the original email (looking up order or campaign context from the failed row) and inserts a fresh `email_log` row reflecting the retry's outcome; the original failed row is left as historical record.

- [ ] **Step 1: Write the retry API route**

```typescript
// app/api/email-log/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/zoho/client'
import { renderTransactionalEmail } from '@/lib/zoho/templates'

export async function POST(request: NextRequest) {
  const { emailLogId } = (await request.json()) as { emailLogId: string }
  const supabase = createServiceClient()

  const { data: logRow, error } = await supabase.from('email_log').select('*').eq('id', emailLogId).single()
  if (error || !logRow) return NextResponse.json({ ok: false, error: 'Log entry not found' }, { status: 404 })
  if (logRow.type !== 'transactional' || !logRow.order_id) {
    return NextResponse.json({ ok: false, error: 'Only transactional sends can be retried here; retry marketing sends by re-queuing the campaign' }, { status: 400 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, parsed_items, total, customer_id, customers(name, email)')
    .eq('id', logRow.order_id)
    .single()
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

  const customer = (order as any).customers
  const { subject, html } = renderTransactionalEmail(logRow.template_used as any, {
    blanxerOrderNumber: order.blanxer_order_number, items: order.parsed_items as any, total: order.total, customerName: customer?.name ?? null,
  })

  try {
    if (!customer?.email) throw new Error('Customer has no email on file')
    const result = await sendEmail(supabase, { to: customer.email, subject, htmlBody: html })
    await supabase.from('email_log').insert({ order_id: order.id, customer_id: order.customer_id, type: 'transactional', template_used: logRow.template_used, status: 'sent', zoho_message_id: result.messageId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await supabase.from('email_log').insert({ order_id: order.id, customer_id: order.customer_id, type: 'transactional', template_used: logRow.template_used, status: 'failed', error_message: (err as Error).message })
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Write the send history page**

```tsx
// app/email-log/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export default function EmailLogPage() {
  const [rows, setRows] = useState<any[]>([])

  async function load() {
    const supabase = createBrowserClient()
    const { data } = await supabase.from('email_log').select('*').order('sent_at', { ascending: false }).limit(200)
    setRows(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function retry(id: string) {
    await fetch('/api/email-log/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailLogId: id }) })
    load()
  }

  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.sent_at}</td>
            <td>{r.type}</td>
            <td>{r.template_used}</td>
            <td>{r.status}</td>
            <td>{r.error_message}</td>
            <td>{r.status === 'failed' && r.type === 'transactional' && <button onClick={() => retry(r.id)}>Retry</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 3: Add the Zoho-broken banner to the shared layout**

```tsx
// app/layout.tsx
import { createServiceClient } from '@/lib/supabase/server'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceClient()
  const { data: status } = await supabase.from('system_status').select('zoho_connected, last_error').single()

  return (
    <html lang="en">
      <body>
        {status && !status.zoho_connected && (
          <div style={{ background: '#c0392b', color: '#fff', padding: '8px', textAlign: 'center' }}>
            Email sending is broken — reconnect Zoho. ({status.last_error})
          </div>
        )}
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, force a failed transactional send (e.g. temporarily set an invalid `ZOHO_ACCOUNT_ID`), visit `/email-log`.
Expected: the failed row is visible with its error message; clicking Retry (after restoring the correct env var) sends successfully and a new `sent` row appears. Manually set `system_status.zoho_connected = false` in Supabase Studio and reload any page — the red banner appears at the top; setting it back to `true` removes it.

- [ ] **Step 5: Commit**

```bash
git add app/email-log app/api/email-log/retry app/layout.tsx
git commit -m "feat: add send history, retry, and Zoho connection banner"
```

---

## Self-Review Notes

- **Spec coverage:** Sections 3–5 (stack, architecture, data model) → Task 1. Section 6 (parser) → Task 4. Section 7 transactional flow → Tasks 5–6. Section 7 marketing flow → Tasks 7–8. Section 8 (templates) → Task 6 (`shell`) + Task 7 (campaign body reuse). Section 9 (error handling) → Tasks 3, 6, 8, 9. Section 10 (auth/roles) → Task 2 (single role, no tiers needed — RLS policies grant any authenticated user full access). Section 11 (testing) → Task 3 Step 6 (manual test send), Task 7 (test mode). Section 12 (build order) → Task ordering matches 1:1 with an extra split (send history separated from status buttons into its own task since it has an independent reviewable deliverable).
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact manual command.
- **Type consistency:** `OrderStatus` defined once in `lib/types.ts` (Task 6) and reused in Task 9; `ParsedOrder`/`ParsedItem` defined once in Task 4 and reused in Tasks 5, 6, 9; `SegmentFilter` defined once in Task 7 and reused in Task 7's route and campaign builder UI.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-20-coversbee-mail.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
