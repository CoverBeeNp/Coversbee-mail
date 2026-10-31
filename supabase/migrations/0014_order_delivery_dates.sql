-- supabase/migrations/0014_order_delivery_dates.sql
--
-- Blanxer's dispatch and delivery times, used for delivery speed on the Data
-- tab. Null until read from Blanxer, and on orders it never recorded them for.
alter table orders
  add column dispatched_at timestamptz,
  add column delivered_at timestamptz;
