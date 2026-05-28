-- 1. Add tracking column to orders table if it doesn't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- 2. Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Enable pg_net extension (used for http requests) if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4. Schedule the job to run every 5 minutes and check scheduled deliveries
-- Replace YOUR_SUPABASE_ANON_KEY with your actual anonymous API key.
-- Replace YOUR_PROJECT_REF with your actual project reference (e.g. tbbezmpobjdkwpoflfcs).
SELECT cron.schedule(
  'send-delivery-reminders-every-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tbbezmpobjdkwpoflfcs.supabase.co/functions/v1/messenger-webhook',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"}'::jsonb,
    body := '{"action": "check_scheduled_reminders"}'::jsonb
  );
  $$
);
