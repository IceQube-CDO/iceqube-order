-- ==========================================================================
-- Scheduled Delivery Reminders — Server-Side Setup
-- ==========================================================================
-- This runs INSIDE Supabase so reminders fire even when no browser is open.
-- Run this SQL in Supabase Dashboard → SQL Editor → New Query → Run.
-- ==========================================================================

-- 1. Add tracking column to orders table if it doesn't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- 2. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Remove old job if it exists (safe to run multiple times)
SELECT cron.unschedule('send-delivery-reminders-every-5m');

-- 4. Schedule the reminder check to run every 5 minutes
SELECT cron.schedule(
  'send-delivery-reminders-every-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tbbezmpobjdkwpoflfcs.supabase.co/functions/v1/messenger-webhook',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmV6bXBvYmpka3dwb2ZsZmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI1MzIsImV4cCI6MjA5MjI2ODUzMn0.Wt3wDzE8CBpBEQCa2rb8OJM42uBEL8bjWlddqc0yWJs"}'::jsonb,
    body := '{"action": "check_scheduled_reminders"}'::jsonb
  );
  $$
);
