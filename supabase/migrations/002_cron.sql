-- Runs every minute; publishes messages whose scheduled time has passed
select cron.schedule(
  'publish-scheduled-messages',
  '* * * * *',
  $$
    update messages
    set published_at = now()
    where scheduled_at <= now()
      and published_at is null;
  $$
);
