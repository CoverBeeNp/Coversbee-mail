-- supabase/migrations/0010_finance_support.sql
--
-- Extends the Mail schema so this one project also serves the finance pages
-- (Coversbee Data). See docs/superpowers/specs/2026-10-31-coversbee-data-design.md.
--
-- Every change here is additive or relaxes a constraint, so the app version
-- deployed before this migration keeps working after it is applied.

-- orders.status remains the email workflow status, set only when staff send a
-- status email. blanxer_status is Blanxer's own status and is what revenue
-- depends on. They answer different questions and must stay separate.
--
-- A null status means the order is not part of the email workflow: historical
-- orders brought in from Finance, and orders entered outside Blanxer. Those
-- orders must never offer status emails.
alter table orders
  add column subtotal numeric,
  add column delivery_charge numeric,
  add column blanxer_status text,
  add column source text not null default 'blanxer',
  add constraint orders_source_check check (source in ('blanxer', 'manual'));

alter table orders alter column status drop not null;
alter table orders alter column customer_id drop not null;

create index orders_blanxer_status_idx on orders (blanxer_status);
create index orders_created_at_idx on orders (created_at);

-- Blanxer's own customer id, a stronger match than phone or email. Unique but
-- nullable, because customers added by hand have no Blanxer id.
alter table customers add column blanxer_customer_id text unique;

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references expense_categories(id),
  amount numeric not null,
  expense_date date not null,
  note text,
  paid_to text,
  paid_by text,
  amount_usd numeric,
  created_at timestamptz not null default now()
);
create index expenses_category_id_idx on expenses (category_id);
create index expenses_expense_date_idx on expenses (expense_date);
create index expenses_paid_by_idx on expenses (paid_by);

-- Singleton row holding the staff-reported current bank balance. There is no
-- feed for this figure, so staff key it in directly.
create table bank_balance (
  id boolean primary key default true,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint bank_balance_single_row check (id)
);
insert into bank_balance (id, amount) values (true, 0);

-- Locked monthly P&L snapshots. Figures are frozen here rather than recomputed,
-- so a statement stays a stable record even if older data is corrected later.
create table monthly_statements (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,
  revenue numeric not null,
  expenses numeric not null,
  profit numeric not null,
  margin_percent numeric not null,
  prev_month_revenue numeric,
  prev_month_profit numeric,
  opening_balance numeric,
  closing_balance numeric not null,
  balance_as_of timestamptz not null,
  return_amount numeric not null default 0,
  category_breakdown jsonb not null default '[]',
  top_products jsonb not null default '[]',
  top_colors jsonb not null default '[]',
  top_device_models jsonb not null default '[]',
  generated_at timestamptz not null default now()
);

-- This project's anon key is public in the browser, so financial tables get
-- RLS with no policies and no grants to anon or authenticated. Staff reach
-- them only through server code that checks the login first, then uses the
-- service role.
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table bank_balance enable row level security;
alter table monthly_statements enable row level security;

grant select, insert, update, delete on expense_categories to service_role;
grant select, insert, update, delete on expenses to service_role;
grant select, insert, update, delete on bank_balance to service_role;
grant select, insert, update, delete on monthly_statements to service_role;
