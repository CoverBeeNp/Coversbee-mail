# Coversbee Data

**Live app:** [coversbee-mail.vercel.app](https://coversbee-mail.vercel.app)

Internal tool for CoversBee staff covering customer communication and the store's finances, without living inside Blanxer (the store platform) or a generic email client:

- **Order tracking & status emails** — keep a record of each Blanxer order and its customer, and notify the customer by email as the order moves through received → dispatched → delivered (or gets cancelled). Blanxer is the source of truth: "Sync from Blanxer" compares every order against the store's API, and runs by itself every 15 minutes while the app is open. It never deletes anything and never sends email.
- **Send history** — every order email attempt is logged with its outcome, and a failed send can be retried right from that log instead of digging through Zoho.

- **Finance** — revenue, expenses, profit and margin for any date range, returns and cancellations, new and returning customers, delivery speed and late orders, seasonality, top products, colors and device models, expense tracking, orders made outside Blanxer, a staff-entered bank balance, and locked monthly statements that can be printed or exported as CSV.

Revenue excludes the delivery charge and any order Blanxer marks Cancelled or Returned. Orders have two statuses. `blanxer_status` is Blanxer's own status and drives revenue. `status` is the app's workflow status, which follows Blanxer: Delivered and Cancelled always apply, and in-between statuses only move forward, so a status email sent ahead of Blanxer isn't undone. A status set by sync doesn't mean an email was sent; the Email log records that. A null `status` means the order isn't in the workflow, as with historical orders and sales outside Blanxer. These appear only on the finance pages and can't be sent status emails.

Campaigns were removed on 2026-10-31. The `campaigns` and `campaign_recipients` tables stay as a record of past sends.

Everything sits in one app with one sidebar, ordered around the working day: **Today** lists what needs doing and how the month is tracking, followed by Orders and Finance. "Sync from Blanxer" is always in the sidebar.

Staff sign in with a Supabase account; there's no public signup, and every page and API route requires a login except the customer-facing unsubscribe link.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — safe to expose to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key. **Server-only.** |
| `BLANXER_API_KEY` | Blanxer store API key (Blanxer dashboard → Settings → API), used by "Sync from Blanxer". Server-only. |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho Mail OAuth credentials (see below). Server-only. |
| `ZOHO_ACCOUNT_ID` | The Zoho Mail account ID for the sending mailbox. |
| `ZOHO_FROM_ADDRESS` | Sending address, e.g. `info@coversbee.com.np`. |
| `NEXT_PUBLIC_APP_URL` | The app's own public URL (e.g. `https://coversbee-mail.vercel.app`, or `http://localhost:3000` locally), used for the logo and unsubscribe link in every email. |

## Setting up a fresh Supabase project

1. Create a project in the Supabase dashboard, then link and push migrations:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

2. Create staff accounts: Supabase dashboard → Authentication → Users → Add user (email/password).

## Copying the Finance data in

A one-time step. Full cutover steps and checks are in `docs/superpowers/specs/2026-10-31-coversbee-data-design.md`.

Create `.env.copy` (ignored by git) with `SOURCE_SUPABASE_URL` and `SOURCE_SERVICE_ROLE_KEY` for Finance, and `TARGET_SUPABASE_URL` and `TARGET_SERVICE_ROLE_KEY` for this project.

```bash
node --env-file=.env.copy scripts/copy-finance-data.ts           # dry run: reads only, reports duplicates and conflicts
node --env-file=.env.copy scripts/copy-finance-data.ts --apply --finance-tables   # copies categories, expenses, statements and bank balance
```

Orders were copied on 2026-10-31 and now follow Blanxer, so re-applying them from Finance is refused without `--include-orders`.

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

If the refresh token is ever revoked, the app flips `system_status.zoho_connected` to `false` and shows a banner. Reconnecting means repeating steps 2–3 and updating `ZOHO_REFRESH_TOKEN` in `.env.local` and Vercel.

### Zoho sending limits

Zoho Mail caps outgoing external mail at 50–500 emails/hour on a rolling basis, depending on sender reputation, and blocks bursts even under that cap with `550 5.4.6 Unusual sending activity detected`. This is why bulk campaigns were removed: a regular mailbox can't handle them. Order status emails go out one at a time and aren't affected. If sending is ever blocked, `mail.zoho.com/mailadmin` has a self-service unblock.

## Running locally

Requires Docker and Node.

```bash
npm install
npx supabase start      # local Postgres/Auth/Studio
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
