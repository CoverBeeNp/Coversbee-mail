-- supabase/migrations/0005_rename_drain_secret.sql
--
-- The cron job's Authorization header now carries an independently-generated
-- DRAIN_FUNCTION_SECRET (set via `supabase secrets set` and mirrored into
-- Vault), not the Supabase-managed service_role key — see the comment in
-- supabase/functions/drain-campaign-queue/index.ts for why. Reschedule the
-- job to read the renamed Vault secret ('drain_function_secret' instead of
-- 'drain_service_role_key'); the actual secret value must be created in
-- Vault separately (not committed here — same reasoning as the Zoho refresh
-- token: it's a real secret, provisioned per-environment via the SQL editor,
-- see README).
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
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'drain_function_secret')
    )
  );
  $$
);
