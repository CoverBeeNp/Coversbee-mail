# CoversBee Mail

Internal staff tool for two things:

- **Transactional order emails** — paste a Blanxer order, save it, and send "received / dispatched / delivered / cancelled" status emails to the customer.
- **Marketing campaigns** — draft an email, preview it, test-send it to a fixed staff list, then send it to a customer segment. Sends are queued and drained hourly (throttled to a daily cap) by a Supabase Edge Function on a `pg_cron` schedule, so a large campaign doesn't blow past Zoho's sending limits.

Staff auth is Supabase email/password (no self-serve signup — accounts are created by an admin in the Supabase dashboard or via the CLI). All app routes and API routes require a logged-in session; Postgres Row Level Security is a second layer of defense on top of that.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project's API URL. Used by both the browser client and server-side clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key. Used for the RLS-respecting clients (browser, Server Components, `proxy.ts`, and the `requireStaff` API auth guard) — safe to expose to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key. **Server-only, never expose to the browser.** Used where RLS needs to be bypassed for legitimate reasons (writing `email_log`/`orders` as part of a send, reading `system_status` for the site-wide banner). |
| `ZOHO_CLIENT_ID` | OAuth client ID for the Zoho Mail API app (see "Zoho OAuth setup" below). |
| `ZOHO_CLIENT_SECRET` | OAuth client secret for the same Zoho app. Server-only. |
| `ZOHO_REFRESH_TOKEN` | Long-lived refresh token minted once during OAuth setup; used to mint short-lived access tokens for every send. Server-only. |
| `ZOHO_ACCOUNT_ID` | The Zoho Mail account ID that owns the sending mailbox (`info@coversbee.com.np`) — part of the Zoho Mail API's send endpoint URL. |
| `ZOHO_FROM_ADDRESS` | The address emails are sent from, e.g. `info@coversbee.com.np`. Must be a verified sending address on the Zoho account above. |
| `ZOHO_DAILY_CAP` | Max marketing ("campaign") emails the hourly drain function will send in a rolling UTC day, e.g. `200`. Protects against blowing past Zoho's sending limits or accidentally spamming the whole customer list in one run. Transactional sends are not subject to this cap. |

The Supabase Edge Function (`supabase/functions/drain-campaign-queue`) runs in a separate Deno runtime and does **not** read `.env.local` — its environment is configured separately via `supabase secrets set` (see below). It needs its own copies of `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `ZOHO_FROM_ADDRESS`, `ZOHO_DAILY_CAP`, plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase Edge Functions get automatically for any deployed function and don't need to be set manually.

## Setting up a fresh Supabase project

1. **Create the project** in the Supabase dashboard (or `supabase projects create`), and grab its project ref, DB password, API URL, anon key, and service role key.

2. **Link the CLI and run migrations:**

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   This applies, in order: `0001_init_schema.sql` (core tables + RLS), `0002_zoho_state_and_settings.sql` (Zoho token cache, `system_status` banner flag, `test_recipients`), and `0003_pg_cron_drain.sql` (the hourly cron job that drains the campaign queue).

3. **Deploy the Edge Function** with `--no-verify-jwt` — this function is triggered by `pg_cron`/`pg_net`, not by an end user's browser session, so it can't present a Supabase JWT. It instead checks its own `Authorization: Bearer <service_role_key>` header at the top of the handler, so don't skip that check even though platform-level JWT verification is off:

   ```bash
   npx supabase functions deploy drain-campaign-queue --no-verify-jwt
   ```

4. **Set the Edge Function's secrets:**

   ```bash
   npx supabase secrets set \
     ZOHO_CLIENT_ID=xxx \
     ZOHO_CLIENT_SECRET=xxx \
     ZOHO_REFRESH_TOKEN=xxx \
     ZOHO_ACCOUNT_ID=xxx \
     ZOHO_FROM_ADDRESS=info@coversbee.com.np \
     ZOHO_DAILY_CAP=200
   ```

5. **Set the two GUCs `0003_pg_cron_drain.sql`'s cron job depends on.** The cron job calls `current_setting('app.settings.drain_function_url')` and `current_setting('app.settings.service_role_key')` to build its request to the Edge Function — if these are unset, `current_setting()` raises inside the cron job and the campaign queue silently never drains (no error surfaces anywhere in the app). Run against your project's database (via the SQL editor in the dashboard, or `psql`):

   ```sql
   alter database postgres set app.settings.drain_function_url = 'https://<your-project-ref>.supabase.co/functions/v1/drain-campaign-queue';
   alter database postgres set app.settings.service_role_key = '<your-service-role-key>';
   ```

   These take effect for new database sessions, so reconnect (or just wait for the next cron tick) before expecting them to apply.

6. **Create staff accounts.** There's no self-serve signup UI; create users via the Supabase dashboard (Authentication → Users → Add user) or `supabase.auth.admin.createUser` with a one-off script, with email/password login enabled.

7. **Seed `test_recipients`** with the staff email addresses that should receive campaign "Send test" sends (a plain table — insert rows via the dashboard's table editor or SQL editor).

## Zoho OAuth setup

Sending goes through the Zoho Mail API using an OAuth refresh token — there's no interactive login at send time, so the setup below is a one-time process to mint that refresh token.

1. Register an app at the [Zoho API Console](https://api-console.zoho.com/) as a **Server-based Application**.
2. Set a redirect URI you control (e.g. `https://localhost/callback` — you only need to capture one redirect during setup, it doesn't need to be a live endpoint).
3. Grant the `ZohoMail.messages.CREATE` scope (send mail). Add other `ZohoMail.*` scopes only if you need them.
4. Generate an authorization code by visiting (substituting your client ID and redirect URI):

   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoMail.messages.CREATE&client_id=<CLIENT_ID>&response_type=code&access_type=offline&redirect_uri=<REDIRECT_URI>
   ```

   Log in as the mailbox owner (`info@coversbee.com.np`) and approve. You'll be redirected with a `code` query param — copy it (it expires in minutes).

5. Exchange that code for a refresh token:

   ```bash
   curl -X POST https://accounts.zoho.com/oauth/v2/token \
     -d "code=<CODE>" \
     -d "client_id=<CLIENT_ID>" \
     -d "client_secret=<CLIENT_SECRET>" \
     -d "redirect_uri=<REDIRECT_URI>" \
     -d "grant_type=authorization_code"
   ```

   The response's `refresh_token` is `ZOHO_REFRESH_TOKEN` — it doesn't expire under normal use (Zoho invalidates it only if unused for a long time or revoked). The app itself mints short-lived access tokens from it automatically and caches them in the `zoho_oauth_state` table.

6. Find `ZOHO_ACCOUNT_ID`: `GET https://mail.zoho.com/api/accounts` with `Authorization: Zoho-oauthtoken <access_token>` returns your account list; use the `accountId` for the mailbox you're sending from.

If the refresh token is ever revoked or expires, the app detects the failed refresh, flips `system_status.zoho_connected` to `false`, and shows a red "Email sending is broken — reconnect Zoho" banner across the whole app — reconnecting means repeating steps 4–5 and updating `ZOHO_REFRESH_TOKEN` both in `.env.local`/Vercel and via `supabase secrets set` for the Edge Function.

## Running locally

Requires Docker (for the local Supabase stack) and Node.

```bash
npm install
npx supabase start           # starts local Postgres/Auth/Studio/Edge Runtime in Docker
npx supabase db reset        # applies all migrations to the local DB
npm run dev                  # starts Next.js on http://localhost:3000
```

`npx supabase status` prints the local API URL, anon key, and service role key — put those (as `http://127.0.0.1:54321` etc.) into `.env.local` for local development. `npx supabase functions serve drain-campaign-queue --no-verify-jwt` runs the Edge Function locally if you need to test the drain path directly with `curl`.

Useful checks before committing:

```bash
npx vitest run      # unit tests
npx tsc --noEmit     # typecheck
npm run lint         # eslint
npm run build        # production build
```
