# Coversbee Data: Design Spec

Date: 2026-10-31

## 1. Goal

Turn this app into Coversbee Data: one deployed application doing the work of CoversBee Mail and CoversBee Finance. This repo, its Vercel project and its Supabase project stay as the base. The Mail schema and code are extended to support Finance, Finance's data is copied in, and the Finance app is then deleted.

## 2. Decisions

- Everyone who can log in sees the finance pages. There are no roles.
- The name changes to Coversbee Data in the UI. `coversbee-mail.vercel.app` stays, because sent emails link to it for unsubscribe and logo images.
- Order paste is removed. Orders arrive by Blanxer sync only. Customer paste (`customers/new`) is unaffected.
- Each sync re-checks Blanxer status for orders created in the last 30 days.
- Orders that exist only in Finance appear in finance pages only, with no status email buttons.
- Customers that exist only in Finance are imported as unsubscribed. This was a recommendation accepted by default, and is easy to change before the copy runs.
- Finance is deleted once Coversbee Data is ready, with no read-only fallback period. Deletion needs its own confirmation at that point.
- Monthly statements are copied exactly and never regenerated.

## 3. Schema changes

All changes are new migrations in this repo, starting at `0010`.

**`orders`**
- Add `subtotal`, `delivery_charge`, `blanxer_status` and `source` (`blanxer` or `manual`, default `blanxer`).
- `status` stays as the Mail email status and is never set from Blanxer. It becomes nullable, and null means "not tracked by the email workflow".
- `customer_id` becomes nullable, as Finance allows.
- `blanxer_order_number` keeps its name and also holds manual `ORD-XXXX` numbers. Renaming a live column adds deployment risk for no functional gain.

**`customers`**
- Add `blanxer_customer_id text unique`.

**New tables**
- `expense_categories`, `expenses`, `bank_balance` and `monthly_statements`, matching Finance's final schema.
- All have RLS enabled with no policies. The anon key is public in this app, and Finance's `bank_balance` and `monthly_statements` never enabled RLS.

## 4. Sync

One route, `app/api/blanxer/sync-orders`, replaces both existing syncs.

- **Window:** from the earlier of the cursor minus 5 minutes, or 30 days ago, walked in month windows.
- **Mapping:** Finance's calculations for totals and item discounts, its colour and model split, and the real Blanxer order date, plus Mail's address and tracking fields.
- **New orders:** inserted with `status = 'received'`.
- **Existing orders:** update `blanxer_status` and financial fields. Never change `status`.
- **Customers:** match on `blanxer_customer_id`, then phone, then email. Fill empty fields only, keeping the existing rule.
- **Cursor:** use Finance's logic, which does not advance past a window whose list call failed.
- **Emails:** sync never sends one.

To check during build: whether Blanxer's list response includes status, which would avoid one detail call per re-checked order, and whether a full window fits inside the Vercel function time limit.

## 5. App changes

**Moved in from Finance, under `/finance/*`:** dashboard, expenses, categories, manual orders, statements, and the supporting `lib/analytics`, `lib/expenses`, `lib/statements`, `lib/bankBalance`, `lib/csv`, `lib/format` and order helpers with their tests. Adds `recharts`.

**Auth**
- Add `/finance/:path*` to the `proxy.ts` matcher. It protects listed paths only, so moved pages are public without this.
- Finance server actions have no checks of their own. Add a server-action staff guard to each one.
- Drop Finance's password login, `APP_PASSWORD` and `SESSION_SECRET`.
- Finance pages read with the service-role client on the server, after the staff check.

**Mail screens**
- Order list and overview counts exclude orders with null `status`.
- The order detail page hides send buttons for null `status`.
- `send-transactional` rejects those orders on the server too.
- Remove `app/(staff)/orders/new`, the paste actions, `parseBlanxerOrder` and `mapBlanxerApiOrder`. Keep `parseCustomerDetails`.
- `saveOrder` keeps linking an order with no `blanxer_id` by its number, so it can't collide with the unique index.
- The customers page and campaign segments read past the 1000 row limit, which the full history would otherwise reach.
- Colour and model are stored separately, and emails and the order page join them back into the "Color/Model" label.

**Name:** update `app/layout.tsx`, `app/login/page.tsx`, `package.json`, `README.md` and `CLAUDE.md`. Customer-facing email content does not change.

## 6. One-time data copy

`scripts/copy-finance-data.ts`, with a dry-run mode that reads only and doubles as the duplicate audit. supabase-js has no transactions, so instead of a transaction it stops before writing if it finds an order conflict, and is safe to re-run. Order of work:

1. Freeze Finance entries. Don't run a final sync in Finance: an order synced only there would count as old and lose its email buttons, while the new sync picks it up as a normal order.
2. Take full database backups of both projects.
3. Clean up the duplicates found in the audit (section 8).
4. Customers: match to existing rows and link `blanxer_customer_id`. Insert unmatched ones with `subscribed_to_marketing = false`. Never change an existing row's subscription, and keep Mail's customer IDs, because unsubscribe links contain them.
5. Orders: match by `blanxer_id`, then order number. Matched rows take Finance's real date, totals, items and Blanxer status, keep their Mail `status`, and pasted rows gain their `blanxer_id`. Unmatched rows are inserted with `status = null`.
6. Copy expense categories, expenses, bank balance and statements with their IDs.

**Checks before anything is deleted**
- Row counts match for every copied table.
- Revenue and expenses by month match Finance.
- Every statement row is identical.
- No customer's subscription changed, and the unsubscribed count did not fall.
- Unsubscribe and logo links still work on the live domain.

## 7. Effects to expect

- The first sync after cutover re-checks 30 days of orders, so any status that changed in Blanxer will move revenue from what Finance showed. That is the fix for the old sync, not a copy error.
- Real order dates will correct the `recent_customers` segment, which currently uses import dates.
- A Finance-only customer who orders again stays unsubscribed, because sync never changes that field.
- Customers imported later through sync default to subscribed, as they do today.

## 8. Build order

1. Read-only audit of live data with the script's dry run: shared phone numbers, shared emails, repeated order numbers, order and customer counts.
2. Migrations, tested on local Supabase.
3. Move Finance code and add auth guards.
4. Unified sync.
5. Mail screen changes and paste removal.
6. Rehearse the copy against local copies of both databases.
7. Cutover using section 6, then deploy.
8. After confirmation, delete the Finance Vercel project and Supabase project, and archive its repo.

## 9. Workflow redesign

Added after the first local review. The two menu bars become one sidebar grouped as Today, Orders, Marketing and Finance. The Blanxer sync button moves to the sidebar. Today replaces Overview, listing what needs doing in order of urgency alongside the month's money. All staff pages share one set of widths. The order page offers the usual next status as its main button.

Migration 0011 hides null-status orders from browser clients, so orders can be copied before the new version is live. Copy with `--keep-mail-items` until then, then run the copy once more without it.

## 10. Second round of changes

Decided after the data copy. Campaigns are removed from the app, because the store can't send more than about 50 emails at once through Zoho Mail. Their tables stay as history, and migration 0012 stops the hourly job. Orders outside Blanxer move to `/orders/outside-blanxer` under Orders, the Finance dashboard is renamed Data, and a profile menu at the bottom of the sidebar holds Log out. The Marketing group is gone and Email log moves under Orders.

## 11. Blanxer as the source of truth

Decided by the user after the data copy, replacing the rule that sync never changes `orders.status` and the 30-day re-check. Every sync lists the full history and fetches details only for orders whose `updated_at` changed, recorded in `orders.blanxer_updated_at` (migration 0013). `status` follows Blanxer through `lib/orders/workflowStatus.ts` with no email sent. Nothing is ever deleted. Returned maps to `cancelled` because the app has no returned status, and `blanxer_status` keeps the real value. Sync also runs every 15 minutes while the app is open.

Migration 0009 turned out never to have been applied to production, so 0013 also adds `out_for_delivery`, safely if it already exists.

## 12. Display and layout

Orders shows the latest 50. Sync sits at the top of the sidebar and the profile at the bottom. Today is compact: four figures, a grouped to-do list beside open orders, and a status strip. One palette and one set of display helpers cover the whole app, and expense breakdown becomes a sorted bar chart.
