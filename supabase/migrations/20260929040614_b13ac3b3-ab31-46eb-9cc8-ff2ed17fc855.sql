CREATE OR REPLACE FUNCTION public.evict_stale_post_translations()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n bigint;
  _total bigint := 0;
BEGIN
  LOOP
    DELETE FROM public.post_translations
    WHERE ctid IN (
      SELECT ctid FROM public.post_translations
      WHERE last_used_at < now() - interval '30 days'
      LIMIT 5000
    );
    GET DIAGNOSTICS _n = ROW_COUNT;
    _total := _total + _n;
    EXIT WHEN _n = 0;
  END LOOP;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.evict_stale_post_translations() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evict-stale-post-translations') THEN
    PERFORM cron.unschedule('evict-stale-post-translations');
  END IF;
  PERFORM cron.schedule('evict-stale-post-translations', '40 3 * * *', 'SELECT public.evict_stale_post_translations();');
END $$;

SELECT public.evict_stale_post_translations();

DO $$
DECLARE
  r record;
  _t int;
BEGIN
  FOR r IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname IN ('sync-category-log-daily','refresh-leaderboard-full-daily','refresh-leaderboard-periods-daily','auto-transcribe-ended-stages','editor-assets-cleanup-daily','creator-job-recovery')
      AND command NOT LIKE '%timeout_milliseconds%'
  LOOP
    _t := CASE WHEN r.jobname LIKE 'refresh-leaderboard-%' THEN 300000 ELSE 55000 END;
    PERFORM cron.alter_job(r.jobid, command := regexp_replace(r.command, '(body := ''[^'']*''::jsonb)', '\1,' || E'\n' || '    timeout_milliseconds := ' || _t));
  END LOOP;
END $$;

DO $$
DECLARE _id bigint;
BEGIN
  SELECT jobid INTO _id FROM cron.job WHERE jobname = 'auto-dub-sweep';
  IF _id IS NOT NULL THEN
    PERFORM cron.alter_job(_id, active := false);
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feature_requests','store_reviews','stories','video_dubs'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

REINDEX TABLE public.tip_leaderboard_cache;