-- supabase/migrations/0007_blanxer_order_sync.sql
--
-- Support pulling orders directly from the Blanxer API (app/api/blanxer/sync-orders)
-- instead of relying solely on the manual copy-paste flow in app/(staff)/orders/new.
-- blanxer_id is the Mongo _id from Blanxer's order object — a stable dedup key
-- unlike blanxer_order_number, which is just a display sequence number.
alter table orders add column blanxer_id text unique;

-- API-synced orders have no pasted text to store; only the manual paste flow
-- (app/(staff)/orders/actions.ts) still populates this column.
alter table orders alter column raw_pasted_text drop not null;

-- Singleton cursor row (same pattern as zoho_oauth_state/system_status) marking
-- how far back the last successful sync looked. Seeded at migration-apply time
-- so the first sync only pulls orders created from here forward, not Blanxer's
-- full historical order list.
create table blanxer_sync_state (
  id boolean primary key default true,
  last_synced_at timestamptz not null default now(),
  constraint blanxer_sync_state_singleton check (id)
);
insert into blanxer_sync_state (id) values (true) on conflict do nothing;

alter table blanxer_sync_state enable row level security;

-- Local Supabase CLI defaults auto_expose_new_tables to off, so this new table
-- gets no Data API grants unless stated explicitly (see 0002's comment on the
-- same issue). Only the service-role sync route touches this table — no
-- authenticated-role policy/grant needed, unlike system_status/test_recipients.
grant select, update on blanxer_sync_state to service_role;
