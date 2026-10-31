-- supabase/migrations/0011_hide_untracked_orders.sql
--
-- Orders with a null status are outside the email workflow: historical orders
-- and sales made outside Blanxer. Browser clients have no use for them, because
-- the finance pages read through server code with the service role.
--
-- A restrictive policy narrows the existing "authenticated full access" policy
-- rather than widening anything. It also protects an older deployed version of
-- the app, which doesn't filter these orders itself and would otherwise offer
-- status emails for them.
create policy "hide orders outside the email workflow" on orders
  as restrictive
  for select
  to authenticated
  using (status is not null);
