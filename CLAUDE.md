# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Coversbee Data: internal Next.js tool for CoversBee staff covering order status emails for Blanxer orders and the store's finances, without living inside Blanxer or a generic email client. See README.md for the full feature description, environment variables, Supabase project setup, and Zoho OAuth setup — read it before touching auth, email sending, or the Blanxer sync.

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

**Auth.** `proxy.ts` (Next.js middleware — note: `proxy`, not the usual `middleware` export name) gates only the paths in its `matcher` via Supabase cookie-based auth, redirecting unauthenticated requests to `/login`, so a new top-level section must be added there. `/login`, `/unsubscribe` and `/api/unsubscribe` stay public because customers reach them from email links. API routes additionally call `requireStaff()` (`lib/auth/requireStaff.ts`) since middleware alone isn't defense in depth for route handlers. Supabase client construction is split three ways by context: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts`'s `createServerClient()` (RLS-respecting, cookie-based, for Server Components/pages) vs `createServiceClient()` (service-role, bypasses RLS — use only where RLS genuinely can't apply). There's no public signup; staff accounts are created directly in the Supabase dashboard.

**Blanxer is the source of truth for orders.** Orders arrive only through sync (`lib/blanxer/sync.ts`, called by `app/api/blanxer/sync-orders`, polling `GET /order/:store_id` since Blanxer has no webhooks — note the Cloudflare bot-check headers required on every call). Every sync lists the full history, which takes seconds, and fetches details only where `updated_at` differs from `orders.blanxer_updated_at`. Sync runs from the sidebar button and automatically every 15 minutes while the app is open. It never deletes anything and never sends email. Saving goes through `lib/orders/saveOrder.ts`, which matches customers by Blanxer id, then phone, then email, fills only empty fields, and never writes `subscribed_to_marketing`.

**Orders have two statuses.** `orders.blanxer_status` is Blanxer's wording and drives revenue through `lib/analytics/orderFilters.ts`. `orders.status` is the app's workflow status, derived from Blanxer by `lib/orders/workflowStatus.ts`: Delivered and Cancelled always apply, and in-between statuses only move forward, so a status email sent ahead of Blanxer isn't undone. A status change from sync doesn't mean an email went out; `email_log` records that. A null `status` means not in the workflow (historical orders and sales outside Blanxer): these stay out of the order list and Today counts, `send-transactional` refuses them, and migration 0011 hides them from browser clients.

**Navigation.** The sidebar is `app/(staff)/StaffNav.tsx`, driven by `lib/navigation.ts`. Page containers use the `.page` and `.page-narrow` classes. The Today page (`/overview`) gets its to-do list from `lib/overview/todos.ts`.

**One way of showing data.** Colours are tokens in `app/globals.css`, with `positive` and `negative` for status. Charts take theirs from `lib/chartTheme.ts`, where colour follows the measure. Headline figures use `StatTile`, amounts `formatAmount`, dates `formatDate`, and order statuses `ORDER_STATUS_BADGE`. Don't add raw Tailwind colours or hex values to pages. Customer emails keep their own styling.

**Finance pages** live under `app/(staff)/finance`. Financial tables have RLS with no policies and no grants to `anon` or `authenticated`, so they are reached only by server code using the service role. Every export of a `'use server'` file must call `requireUser()` (`lib/auth/requireUser.ts`) first, because `proxy.ts` only covers the paths it lists; `lib/auth/serverFunctions.test.ts` enforces this, and its module list needs updating for any new server file. Revenue excludes the delivery charge. Monthly statements are frozen snapshots: never recompute a stored one.

**More than 1000 rows.** PostgREST caps responses at 1000 rows. Use `lib/supabase/fetchAllRows.ts` for anything that must see every row; it throws on a failed page rather than returning partial data.

**Email log.** Every send attempt is recorded in `email_log`, and failed status emails can be retried from `app/api/email-log/retry/route.ts`. Rows with type `marketing` are history from the removed campaigns feature and can't be retried.

**Schema.** Supabase migrations in `supabase/migrations/` are the source of truth for tables/enums/RLS policies — read the latest relevant migration rather than inferring schema from query call sites alone, since RLS policies and grants live there too, not in application code.

## Conventions

- Path alias `@/*` maps to the repo root (see `tsconfig.json`).
- Tests are colocated as `*.test.ts` next to the module they cover (Vitest, node environment).
- User-supplied content (customer names/addresses from Blanxer, parsed order fields) is HTML-escaped before interpolation into email templates (`lib/zoho/templates.ts`'s `escapeHtml`).
