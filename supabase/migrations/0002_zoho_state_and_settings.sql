-- supabase/migrations/0002_zoho_state_and_settings.sql
create table zoho_oauth_state (
  id boolean primary key default true,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint zoho_oauth_state_singleton check (id)
);
insert into zoho_oauth_state (id) values (true);

create table system_status (
  id boolean primary key default true,
  zoho_connected boolean not null default true,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint system_status_singleton check (id)
);
insert into system_status (id) values (true);

create table test_recipients (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table zoho_oauth_state enable row level security;
alter table system_status enable row level security;
alter table test_recipients enable row level security;
create policy "authenticated read" on system_status for select using (auth.role() = 'authenticated');
create policy "authenticated full access" on test_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- This local Supabase CLI defaults auto_expose_new_tables to off (the new cloud default), so
-- new tables get no Data API grants unless stated explicitly. service_role must be able to
-- read/write these tables for lib/zoho/client.ts to function; authenticated needs matching
-- grants for the RLS policies above to have any effect.
grant select, update on zoho_oauth_state to service_role;
grant select on system_status to authenticated;
grant select, update on system_status to service_role;
grant select, insert, update, delete on test_recipients to authenticated, service_role;
