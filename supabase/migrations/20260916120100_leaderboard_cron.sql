-- Leaderboard refresh schedule, versioned.
--
-- Both jobs have existed in production since the cache was introduced but
-- lived only in the pg_cron table. This puts them in the repo, and makes the
-- migration safe to re-run: each job is unscheduled if present, then created.
--
-- The bearer is the project's publishable (anon) key — the same value every
-- browser ships with. The function checks no JWT (verify_jwt = false) and
-- does nothing a caller could abuse beyond re-running a refresh.
--
-- Outer blocks use a named tag because the cron command inside is itself
-- dollar-quoted; identical tags would terminate the string early.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-leaderboard-full-daily') THEN
    PERFORM cron.unschedule('refresh-leaderboard-full-daily');
  END IF;
  PERFORM cron.schedule(
    'refresh-leaderboard-full-daily',
    '0 4 * * *',
    $job$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/refresh-leaderboard-cache',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := '{"mode":"full"}'::jsonb,
        timeout_milliseconds := 300000
      );
    $job$
  );
END $do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-leaderboard-periods-daily') THEN
    PERFORM cron.unschedule('refresh-leaderboard-periods-daily');
  END IF;
  PERFORM cron.schedule(
    'refresh-leaderboard-periods-daily',
    '30 4 * * *',
    $job$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/refresh-leaderboard-cache',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := '{"mode":"light","sorts":["holdings"],"periods":["day","week","month","year"]}'::jsonb,
        timeout_milliseconds := 300000
      );
    $job$
  );
END $do$;
