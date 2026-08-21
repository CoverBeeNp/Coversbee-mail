# CoversBee Mail — Design Spec

Date: 2026-08-20

## 1. Goal

A staff-facing web dashboard ("CoversBee Mail") for coversbee.com.np that:
- Sends transactional order-status emails (received, dispatched, delivered, cancelled) triggered manually by staff.
- Sends marketing campaign emails to segments of the customer list, throttled to respect Zoho Mail's free-plan daily send cap.
- Is usable simultaneously by multiple staff on multiple devices (phone, shop PC, laptop) against one shared database.

## 2. Hard constraints

- No DNS access to coversbee.com.np. No new DNS records (hosting or email) may be proposed or required.
- Email sends exclusively through the store's existing Zoho Mail account `info@coversbee.com.np` (Free plan, MX/SPF/DKIM already configured), via the Zoho Mail REST API (OAuth2) — never SMTP.
- Zoho OAuth client id/secret/refresh token are server-side secrets only, never exposed client-side.
- Zoho Free plan daily send cap (~200–250/day, to be confirmed in the Zoho admin console before go-live) must never be exceeded by a single campaign send — large sends are queued and drained over multiple days/hours.
- Order data is never pulled automatically from Blanxer (no webhooks available, and polling deliberately rejected). Staff paste raw order text copied from the Blanxer order page; a parser extracts fields but staff must confirm/edit before save.
- $0 hosting/infra cost at current scale (~100 orders/mo, target 1500 customers by year-end). Free tiers only: Vercel, Supabase, Zoho Mail Free.
- No offline/local sync — a normal multi-user hosted web app against one shared Postgres database is sufficient.

## 3. Stack

- **Frontend/dashboard**: Next.js, hosted on Vercel free tier.
- **Database + auth**: Supabase (Postgres + Supabase Auth), free tier. Single staff role — any authenticated user has full access (no admin/staff tiers).
- **Scheduled jobs**: Supabase Edge Functions + pg_cron, running ~hourly, solely to drain the campaign send queue within the daily cap. Not used for order polling.
- **Email**: Zoho Mail API (`https://mail.zoho.com/api/accounts/{account_id}/messages`) via OAuth2, called server-side only (Vercel API route or Supabase Edge Function).

## 4. Architecture

```
Staff browser (any device)
        │ HTTPS
        ▼
Next.js dashboard (Vercel, free)
        │ Supabase client (reads/writes)
        ▼
Supabase Postgres + Auth (free) ── single shared DB
        │ server-side API route / Edge Function
        ▼
Zoho Mail API (OAuth2) ── sends as info@coversbee.com.np
        │
        ▼
Customer inbox
```

## 5. Data model

```
customers
  id, name, phone, email, subscribed_to_marketing (bool), created_at

orders
  id, customer_id, raw_pasted_text, parsed_items (jsonb), total,
  status enum (received|dispatched|delivered|cancelled),
  blanxer_order_number (free text), created_at, status_updated_at

email_log
  id, order_id (nullable), customer_id, type (transactional|marketing),
  template_used, status (sent|failed), zoho_message_id, sent_at, error_message

campaigns
  id, name, subject, body_template, segment_filter (jsonb),
  status (draft|sending|sent), created_at

campaign_recipients
  campaign_id, customer_id, sent_at, status
```

Status on `orders` is driven only by which transactional email button staff click — never inferred from Blanxer's own status text (which is captured as free text within `raw_pasted_text` for reference only).

## 6. Paste parser (Blanxer order page format)

Confirmed sample format:

```
#1747
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
Product Name
Variant: Color/Model
रू 799 x 1
रू 799
...
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
```

Parser rules (line-based label matching, not NLP):
- `blanxer_order_number`: leading `#(\d+)`.
- Cart items: block between `Cart Items` and `Sub-total`; each item = product name line, optional `Variant: X` line, `रू P x Q` line, `रू lineTotal` line. Emitted into `parsed_items` jsonb as `[{name, variant, unit_price, qty, line_total}]`.
- `Sub-total` / `Delivery Charge` / `Total`: matched by label, next non-empty line has `रू` amount; strip `रू` and thousands separators, parse as number. `total` column = parsed `Total`.
- Customer Details block: each of `Name:`, `Email:`, `Phone Number:`, `Province:`, `City:`, `Address:`, `Landmark:`, `Order Note:` is a label line followed by a value line — value may legitimately be blank (e.g. `Province:` was blank in the sample).
- Blanxer's own status/payment lines (`Status:`, `Payment Method:`, `Created By:`) are not mapped to any structured field beyond being present in `raw_pasted_text`; they play no role in our `orders.status`.
- Any field the parser cannot confidently locate is left blank and flagged on the confirm screen — never guessed. Staff must review/edit every parsed field before save; the raw pasted text stays visible alongside the editable fields for cross-checking.

## 7. Core flows

**Transactional**: staff pastes raw order text → parser extracts fields → confirm/edit screen → save creates/updates `customers` row (matched by phone or email) + `orders` row (`status = received`). Dashboard shows four buttons: "Send Received", "Send Dispatched", "Send Delivered", "Send Cancelled". Clicking one sends the matching templated email via Zoho and, only on send success, updates `orders.status` + `status_updated_at` and writes an `email_log` row. Status is driven by the send action, not the reverse — a failed send does not advance status.

**Marketing**: staff creates a campaign (subject, HTML body via the shared branded template, audience segment filter e.g. all subscribed customers / by last order date) → preview → optional "test mode" sends only to a staff-designated test address list first → send. On send, matching customers are inserted into `campaign_recipients` (`status = queued`) and the campaign's `status` becomes `sending`. An hourly Supabase Edge Function (pg_cron) drains up to the remaining daily allowance from `campaign_recipients` where `status = queued`, sending each via Zoho and updating `sent_at` + `status`. When no `queued` rows remain, `campaigns.status` becomes `sent`.

## 8. Email templates

One reusable branded HTML shell (logo placeholder, brand-color accents, footer with unsubscribe link — using placeholder branding now, swappable once real brand assets are provided) wraps:
- Four fixed transactional templates (received/dispatched/delivered/cancelled), each referencing order number and line items, with editable text blocks per status.
- Campaign bodies, authored per-campaign by staff within the same shell.

## 9. Error handling

- Any Zoho send failure (rate limit, invalid address, expired token) is logged in `email_log` with `status = failed` and `error_message`, and is visible + individually retryable from the dashboard. Never silently swallowed.
- OAuth token refresh happens server-side automatically before each send batch. If refresh itself fails (token revoked), the dashboard shows a persistent banner: "Email sending is broken — reconnect Zoho."
- Paste parser: unrecognized/ambiguous fields are left blank and flagged for manual entry rather than guessed.

## 10. Auth / roles

Supabase Auth (email/password). Single role — every authenticated staff member has full access to orders, sending, and campaigns. No admin/staff tiers for now.

## 11. Testing / verification

- Manual test send to a personal address before enabling each new template in production.
- Campaign "test mode" toggle restricts a send to a staff-designated test address list before the real segment send.

## 12. Build order

1. Supabase project + schema + Auth (staff login).
2. Zoho OAuth app registration + a minimal server-side "send test email" function — verify end-to-end before building UI around it.
3. Order paste form + parser + confirm screen + save.
4. Order list + status buttons wired to send + log.
5. Campaign builder + segment filter + queued/throttled send via scheduled function.
6. Send history / retry UI for failed emails.

## 13. Open items to confirm before go-live (non-blocking for build)

- Exact Zoho Free plan daily send cap — confirm in the Zoho admin console; queue drain rate should be set from the confirmed number, not assumed.
- Real brand assets (logo, colors) for the HTML email shell — placeholder branding used until provided.
