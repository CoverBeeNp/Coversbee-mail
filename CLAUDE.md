# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Coversbee Data: internal Next.js tool for CoversBee staff covering customer communication around Blanxer orders, marketing email, and the store's finances, without living inside Blanxer or a generic email client. See README.md for the full feature description, environment variables, Supabase project setup, and Zoho OAuth setup — read it before touching auth, email sending, or the Blanxer sync.

## Commands

```bash
npm install
npx supabase start      # local Postgres/Auth/Studio/Edge Runtime (requires Docker)
npx supabase db reset   # apply migrations
npm run dev              # http://localhost:3000

npx vitest run                        # unit tests
npx vitest run path/to/file.test.ts   # single test file
npx tsc --noEmit                      # typecheck
npm run lint                          # eslint
npm run build                         # production build
```

`npx supabase status` prints the local API URL/keys for `.env.local`.

## Architecture

**Two runtimes, one duplicated email-sending core.** The Next.js app (Node) queues marketing sends into `campaign_recipients`; a Supabase Edge Function (`supabase/functions/drain-campaign-queue`, Deno) drains that queue hourly via pg_cron. Deno can't import the Node app's TS modules, so the Zoho client and the campaign email HTML shell are hand-duplicated in the Edge Function — see the file-level comment in `supabase/functions/drain-campaign-queue/index.ts`. When changing `lib/zoho/client.ts` or the shell/`renderCampaignEmail` in `lib/zoho/templates.ts`, mirror the change there too.

**Auth.** `proxy.ts` (Next.js middleware — note: `proxy`, not the usual `middleware` export name) gates only the paths in its `matcher` via Supabase cookie-based auth, redirecting unauthenticated requests to `/login`, so a new top-level section must be added there. `/login`, `/unsubscribe` and `/api/unsubscribe` stay public because customers reach them from email links. API routes additionally call `requireStaff()` (`lib/auth/requireStaff.ts`) since middleware alone isn't defense in depth for route handlers. Supabase client construction is split three ways by context: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts`'s `createServerClient()` (RLS-respecting, cookie-based, for Server Components/pages) vs `createServiceClient()` (service-role, bypasses RLS — use only where RLS genuinely can't apply). There's no public signup; staff accounts are created directly in the Supabase dashboard.

**Order ingestion is Blanxer sync only.** "Sync from Blanxer" (`app/api/blanxer/sync-orders`, backed by `lib/blanxer/client.ts`, which polls `GET /order/:store_id` since Blanxer has no webhooks — note the Cloudflare bot-check headers required on every call) reads everything since the cursor and at least the last 30 days, then saves through `lib/orders/saveOrder.ts`. That matches customers by Blanxer id, then phone, then email, fills only empty fields, and never writes `subscribed_to_marketing`.

**Orders have two statuses; keep them separate.** `orders.status` is the email workflow status, set on insert and then only by sending a status email. `orders.blanxer_status` is Blanxer's status and drives revenue through `lib/analytics/orderFilters.ts`. A null `status` means not in the email workflow (historical orders and sales outside Blanxer): these stay out of the order list and Today counts, `send-transactional` refuses them, and migration 0011 hides them from browser clients. Sync must never write `status` on an existing order.

**Navigation.** The sidebar is `app/(staff)/StaffNav.tsx`, driven by `lib/navigation.ts`. Page containers use the `.page` and `.page-narrow` classes. The Today page (`/overview`) gets its to-do list from `lib/overview/todos.ts`.

**Finance pages** live under `app/(staff)/finance`. Financial tables have RLS with no policies and no grants to `anon` or `authenticated`, so they are reached only by server code using the service role. Every export of a `'use server'` file must call `requireUser()` (`lib/auth/requireUser.ts`) first, because `proxy.ts` only covers the paths it lists; `lib/auth/serverFunctions.test.ts` enforces this, and its module list needs updating for any new server file. Revenue excludes the delivery charge. Monthly statements are frozen snapshots: never recompute a stored one.

**More than 1000 rows.** PostgREST caps responses at 1000 rows. Use `lib/supabase/fetchAllRows.ts` for anything that must see every row; it throws on a failed page rather than returning partial data.

**Campaign send flow:** compose → preview (rendered client-side, hence `NEXT_PUBLIC_APP_URL` for logo/unsubscribe links — see the comment in `lib/zoho/templates.ts`) → test-send to staff (`app/api/zoho/test-send`, addresses from the `test_recipients` table) → `app/api/campaigns/send/route.ts` resolves the segment (`lib/segments/resolveSegment.ts`) and queues one `campaign_recipients` row per matched customer → the Edge Function drains the queue on its own schedule, throttled and spaced to respect Zoho's rolling-hourly send limit and burst-detection (see README's "Zoho sending limits" section — do not remove the inter-send delay).

**Email log.** Every send attempt (transactional order-status emails and marketing campaign emails alike) is recorded in `email_log`, and failed sends can be retried from `app/api/email-log/retry/route.ts` rather than re-driving the original flow.

**Schema.** Supabase migrations in `supabase/migrations/` are the source of truth for tables/enums/RLS policies — read the latest relevant migration rather than inferring schema from query call sites alone, since RLS policies and grants live there too, not in application code.

## Conventions

- Path alias `@/*` maps to the repo root (see `tsconfig.json`).
- `supabase/functions/**` is excluded from this project's `tsc`/eslint — it's Deno, checked separately (`deno lint`/`deno check` or `supabase functions serve`).
- Tests are colocated as `*.test.ts` next to the module they cover (Vitest, node environment).
- User-supplied content (customer names/addresses from Blanxer, parsed order fields) is HTML-escaped before interpolation into email templates (`lib/zoho/templates.ts`'s `escapeHtml`); staff-authored campaign body HTML is intentionally not escaped, since it's meant to render as HTML.
