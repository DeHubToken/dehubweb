-- Lock down client_error_logs.
--
-- The anon INSERT policy let anyone holding the public anon key write rows
-- straight into this table through PostgREST, bypassing the client-logs
-- endpoint's per-IP rate limit entirely. Combined with uncapped metadata and
-- a cleanup function that was never scheduled, table growth was unbounded in
-- every dimension.
--
-- The web app's two remaining direct writers (ErrorBoundary, AssistantPage)
-- now go through the endpoint like the batched logger always did, so the
-- policy can go. Reads stay authenticated-only; retention becomes real below.

DROP POLICY IF EXISTS "Allow anonymous log insertion" ON public.client_error_logs;

-- The 30-day cleanup has existed since February but was never scheduled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-client-error-logs') THEN
    PERFORM cron.schedule(
      'cleanup-client-error-logs',
      '23 4 * * *',
      $$SELECT public.cleanup_old_client_error_logs()$$
    );
  END IF;
END $$;
