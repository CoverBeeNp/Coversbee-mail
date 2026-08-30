# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Internal Next.js tool for CoversBee staff to manage customer communication around Blanxer orders and marketing email, without living inside Blanxer or a generic email client. See README.md for the full feature description, environment variables, Supabase project setup, and Zoho OAuth setup — read it before touching auth, email sending, or the Blanxer sync.

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

**Auth.** `proxy.ts` (Next.js middleware — note: `proxy`, not the usual `middleware` export name) gates every route except `/login` and `/api/unsubscribe` (reached from email links, never a logged-in session) via Supabase cookie-based auth, redirecting unauthenticated requests to `/login`. API routes additionally call `requireStaff()` (`lib/auth/requireStaff.ts`) since middleware alone isn't defense in depth for route handlers. Supabase client construction is split three ways by context: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts`'s `createServerClient()` (RLS-respecting, cookie-based, for Server Components/pages) vs `createServiceClient()` (service-role, bypasses RLS — use only where RLS genuinely can't apply). There's no public signup; staff accounts are created directly in the Supabase dashboard.

**Order ingestion has two paths into one save function.** Staff can paste a Blanxer order page's text (parsed by `lib/parser/blanxerParser.ts`) or hit "Sync from Blanxer" (`app/api/blanxer/sync-orders`, backed by `lib/blanxer/client.ts`, which polls `GET /order/:store_id` since Blanxer has no webhooks — note the Cloudflare bot-check headers required on every call). Both paths converge on `lib/orders/saveParsedOrder.ts`, which upserts the customer (matching by phone then email, backfilling only null fields, never overwriting) and inserts the order.

**Campaign send flow:** compose → preview (rendered client-side, hence `NEXT_PUBLIC_APP_URL` for logo/unsubscribe links — see the comment in `lib/zoho/templates.ts`) → test-send to staff (`app/api/zoho/test-send`, addresses from the `test_recipients` table) → `app/api/campaigns/send/route.ts` resolves the segment (`lib/segments/resolveSegment.ts`) and queues one `campaign_recipients` row per matched customer → the Edge Function drains the queue on its own schedule, throttled and spaced to respect Zoho's rolling-hourly send limit and burst-detection (see README's "Zoho sending limits" section — do not remove the inter-send delay).

**Email log.** Every send attempt (transactional order-status emails and marketing campaign emails alike) is recorded in `email_log`, and failed sends can be retried from `app/api/email-log/retry/route.ts` rather than re-driving the original flow.

**Schema.** Supabase migrations in `supabase/migrations/` are the source of truth for tables/enums/RLS policies — read the latest relevant migration rather than inferring schema from query call sites alone, since RLS policies and grants live there too, not in application code.

## Conventions

- Path alias `@/*` maps to the repo root (see `tsconfig.json`).
- `supabase/functions/**` is excluded from this project's `tsc`/eslint — it's Deno, checked separately (`deno lint`/`deno check` or `supabase functions serve`).
- Tests are colocated as `*.test.ts` next to the module they cover (Vitest, node environment).
- User-supplied content (customer names/addresses from Blanxer, parsed order fields) is HTML-escaped before interpolation into email templates (`lib/zoho/templates.ts`'s `escapeHtml`); staff-authored campaign body HTML is intentionally not escaped, since it's meant to render as HTML.
