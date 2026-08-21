-- supabase/migrations/0006_order_address_and_tracking.sql
--
-- The paste parser already extracts a customer's address (address, city,
-- province, landmark) and the Blanxer tracking URL, but neither was ever
-- persisted past the confirm screen — only inside raw_pasted_text as an
-- unstructured blob. The formal transactional email templates need a real
-- delivery/billing address and a tracking link, so store them as columns
-- populated at save time (see app/orders/actions.ts).
alter table orders add column address text;
alter table orders add column tracking_url text;
