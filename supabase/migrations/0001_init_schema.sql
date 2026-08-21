-- supabase/migrations/0001_init_schema.sql
create type order_status as enum ('received', 'dispatched', 'delivered', 'cancelled');
create type email_type as enum ('transactional', 'marketing');
create type email_status as enum ('sent', 'failed');
create type campaign_status as enum ('draft', 'sending', 'sent');

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  subscribed_to_marketing boolean not null default true,
  created_at timestamptz not null default now()
);
create index customers_phone_idx on customers (phone);
create index customers_email_idx on customers (email);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  raw_pasted_text text not null,
  parsed_items jsonb not null default '[]',
  total numeric,
  status order_status not null default 'received',
  blanxer_order_number text,
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);
create index orders_customer_id_idx on orders (customer_id);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_id uuid not null references customers(id),
  type email_type not null,
  template_used text not null,
  status email_status not null,
  zoho_message_id text,
  sent_at timestamptz not null default now(),
  error_message text
);
create index email_log_customer_id_idx on email_log (customer_id);
create index email_log_status_idx on email_log (status);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body_template text not null,
  segment_filter jsonb not null default '{"type":"all_subscribed"}',
  status campaign_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table campaign_recipients (
  campaign_id uuid not null references campaigns(id),
  customer_id uuid not null references customers(id),
  status text not null default 'queued',
  sent_at timestamptz,
  primary key (campaign_id, customer_id)
);

alter table customers enable row level security;
alter table orders enable row level security;
alter table email_log enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;

create policy "authenticated full access" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on email_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on campaigns for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on campaign_recipients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
