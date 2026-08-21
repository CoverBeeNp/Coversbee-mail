# CoversBee Mail

Internal staff tool for two things:

- **Transactional order emails** — paste a Blanxer order, save it, and send "received / dispatched / delivered / cancelled" status emails to the customer.
- **Marketing campaigns** — draft an email, preview it, test-send it to a fixed staff list, then send it to a customer segment. Sends are queued and drained hourly (throttled to a daily cap) by a Supabase Edge Function on a `pg_cron` schedule.

Staff auth is Supabase email/password (no self-serve signup). All app and API routes require a logged-in session except `/unsubscribe` and `/api/unsubscribe`, which are deliberately public — they're reached from links in emails sent to customers, not staff. Postgres Row Level Security is a second layer of defense on the authenticated routes.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — safe to expose to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key. **Server-only.** |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho Mail OAuth credentials (see below). Server-only. |
| `ZOHO_ACCOUNT_ID` | The Zoho Mail account ID for the sending mailbox. |
| `ZOHO_FROM_ADDRESS` | Sending address, e.g. `info@coversbee.com.np`. |
| `ZOHO_HOURLY_CAP` | Max marketing emails the drain sends per rolling 1-hour window — matches Zoho Mail's real limit (50-500/hour, dynamic by account reputation; see "Zoho sending limits" below), not a daily figure. Default 40, conservative for a new/unproven sending account. Transactional sends aren't capped by this. |
| `NEXT_PUBLIC_APP_URL` | The app's own public URL (e.g. `https://coversbee-mail.vercel.app`, or `http://localhost:3000` locally) — used to build the logo image and unsubscribe link embedded in every email footer. `NEXT_PUBLIC_`-prefixed (not just server-side) because the campaign preview page renders emails in the browser, and a plain server-only var isn't visible there — see the comment in `lib/zoho/templates.ts`. |

The Edge Function (`supabase/functions/drain-campaign-queue`) runs on Deno and has its own separate secrets, set via `supabase secrets set` (below) — it does not read `.env.local`, and needs its own copy of the app URL too, set there as plain `APP_URL` (its emails build their own logo/unsubscribe links independently, since the shell is duplicated across the Node/Deno boundary — see the comment in that file; the Deno function has no client/server split, so it doesn't need the `NEXT_PUBLIC_` prefix).

## Setting up a fresh Supabase project

1. Create a project in the Supabase dashboard, then link and push migrations:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

2. Deploy the Edge Function:

   ```bash
   npx supabase functions deploy drain-campaign-queue --no-verify-jwt
   ```

3. Generate a secret for the drain function's own request auth, and set it plus the Zoho secrets:

   ```bash
   openssl rand -hex 32   # this is DRAIN_FUNCTION_SECRET

   npx supabase secrets set \
     DRAIN_FUNCTION_SECRET=<output above> \
     ZOHO_CLIENT_ID=xxx \
     ZOHO_CLIENT_SECRET=xxx \
     ZOHO_REFRESH_TOKEN=xxx \
     ZOHO_ACCOUNT_ID=xxx \
     ZOHO_FROM_ADDRESS=info@coversbee.com.np \
     ZOHO_HOURLY_CAP=40 \
     APP_URL=https://<your-domain>
   ```

4. Store the function URL and that same secret in Supabase Vault (the cron job reads from Vault, not a database-level GUC — Supabase Cloud's `postgres` role can't run `alter database ... set`). Run in the SQL editor:

   ```sql
   select vault.create_secret('https://<your-project-ref>.supabase.co/functions/v1/drain-campaign-queue', 'drain_function_url');
   select vault.create_secret('<DRAIN_FUNCTION_SECRET value>', 'drain_function_secret');
   ```

5. Create staff accounts: Supabase dashboard → Authentication → Users → Add user (email/password).

6. Seed `test_recipients` with staff email addresses for campaign "Send test" (insert rows via the table editor or SQL editor).

## Zoho OAuth setup

1. Register a **Self Client** at the [Zoho API Console](https://api-console.zoho.com/).
2. Generate an authorization code with scope `ZohoMail.messages.CREATE,ZohoMail.accounts.READ`.
3. Exchange it for tokens:

   ```bash
   curl -X POST https://accounts.zoho.com/oauth/v2/token \
     -d "grant_type=authorization_code" \
     -d "client_id=<CLIENT_ID>" \
     -d "client_secret=<CLIENT_SECRET>" \
     -d "code=<CODE>"
   ```

   The response's `refresh_token` is `ZOHO_REFRESH_TOKEN` — it doesn't expire under normal use.

4. Find `ZOHO_ACCOUNT_ID`: `GET https://mail.zoho.com/api/accounts` with `Authorization: Zoho-oauthtoken <access_token>`.

If the refresh token is ever revoked, the app flips `system_status.zoho_connected` to `false` and shows a banner. Reconnecting means repeating steps 2–3 and updating `ZOHO_REFRESH_TOKEN` in both `.env.local`/Vercel and `supabase secrets set`.

### Zoho sending limits (learned the hard way)

Per Zoho Mail's published usage policy: outgoing external mail is capped at **50–500 emails/hour** on a **rolling 1-hour basis** (dynamic, based on sender reputation — assume the low end for a new account), and **burst sending is explicitly not supported regardless of staying under that cap**. A tight loop of API calls with no spacing between them can trigger a `550 5.4.6 Unusual sending activity detected` block even at low total volume — this happened once during development from rapid manual testing, not real usage. Both send loops (the campaign drain function and the campaign test-send route) space sends out by a couple of seconds for exactly this reason; don't remove that delay to "speed things up."

If sending ever gets blocked: `mail.zoho.com/mailadmin` has a self-service unblock, or the auto-generated block notification email includes a direct unblock link. Zoho's own guidance for this kind of workload — automated transactional/notification email, as opposed to human-composed correspondence — is to use **ZeptoMail** (their dedicated transactional-email product) instead of a regular Zoho Mail mailbox. Worth evaluating as order/customer volume grows past what a standard mailbox's reputation can comfortably support; out of scope for the current setup.

## Running locally

Requires Docker and Node.

```bash
npm install
npx supabase start      # local Postgres/Auth/Studio/Edge Runtime
npx supabase db reset   # apply migrations
npm run dev              # http://localhost:3000
```

`npx supabase status` prints the local API URL/keys for `.env.local`.

```bash
npx vitest run      # unit tests
npx tsc --noEmit     # typecheck
npm run lint         # eslint
npm run build        # production build
```
