-- supabase/migrations/0003_pg_cron_drain.sql
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
