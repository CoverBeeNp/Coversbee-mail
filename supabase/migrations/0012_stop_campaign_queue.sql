-- supabase/migrations/0012_stop_campaign_queue.sql
--
-- Campaigns are removed from the app, so the hourly job that drained their send
-- queue has nothing left to do. campaigns, campaign_recipients and
-- test_recipients stay in place as a record of past sends.
do $$
begin
  perform cron.unschedule('drain-campaign-queue');
exception
  when others then null;
end $$;
