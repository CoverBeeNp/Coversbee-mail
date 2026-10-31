-- supabase/migrations/0013_blanxer_updated_at.sql
--
-- Blanxer is the source of truth for orders. Every sync lists the full order
-- history, and this records the Blanxer version each row was last read from,
-- so only orders that actually changed need their full details fetched again.
-- Null means not read yet, which sync treats as changed.
alter table orders add column blanxer_updated_at timestamptz;

-- Migration 0009 added this value but was never applied to the production
-- database, so orders there couldn't hold it. Safe where 0009 did run.
alter type order_status add value if not exists 'out_for_delivery' after 'dispatched';
