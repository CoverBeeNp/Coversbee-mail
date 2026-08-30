-- supabase/migrations/0008_order_number_unique.sql
--
-- Defense in depth alongside the app-level dedup fix in
-- app/api/blanxer/sync-orders/route.ts: a manually-pasted order
-- (app/(staff)/orders/actions.ts) only sets blanxer_order_number, not
-- blanxer_id, so it's possible for two rows to end up with the same
-- Blanxer order number if the app-level check is ever bypassed or buggy.
-- Partial (not a plain `unique`) because blanxer_order_number is
-- nullable — a non-Blanxer/unparsed paste can leave it null, and multiple
-- null rows are not duplicates of each other.
create unique index orders_blanxer_order_number_unique_idx
  on orders (blanxer_order_number)
  where blanxer_order_number is not null;
