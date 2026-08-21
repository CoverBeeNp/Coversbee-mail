-- supabase/migrations/0003_pg_cron_drain.sql
--
-- NOTE: the cron.schedule call below is superseded by
-- 0004_fix_drain_cron_auth.sql, which reschedules the same job using
-- Supabase Vault instead of `current_setting('app.settings.*')`. On
-- Supabase Cloud, the `postgres` role cannot run `alter database ... set`
-- on a custom parameter class (only works in local Docker, where that role
-- is effectively superuser) — see 0004 for the corrected, Vault-based
-- version. This file is left as historical record of the original
-- migration; do not edit it to fix the auth mechanism, extend 0004 instead.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'drain-campaign-queue',
  '0 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.drain_function_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  );
  $$
);
