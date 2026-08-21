-- supabase/migrations/0004_fix_drain_cron_auth.sql
-- Supabase-hosted projects don't grant the `postgres` role permission to run
-- `alter database ... set app.settings.*` (works in local Docker, where that
-- role is effectively superuser, but not on Supabase Cloud). Vault is the
-- supported way to give a pg_cron job access to a secret without exposing it
-- via a database-level GUC.
create extension if not exists supabase_vault;

do $$
begin
  perform cron.unschedule('drain-campaign-queue');
exception
  when others then null;
end $$;

select cron.schedule(
  'drain-campaign-queue',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'drain_function_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'drain_service_role_key')
    )
  );
  $$
);
