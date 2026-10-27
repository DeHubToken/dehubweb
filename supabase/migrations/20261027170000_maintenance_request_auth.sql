-- Server-only maintenance credentials use a separate HMAC domain from wallets.
CREATE OR REPLACE FUNCTION public.issue_maintenance_token(p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE expiry text := (extract(epoch FROM now())::bigint + 300)::text; k bytea;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('editor-assets-cleanup','migrate-ai-images-to-storage') THEN
    RAISE EXCEPTION 'Unknown maintenance action';
  END IF;
  SELECT key INTO STRICT k FROM wallet_auth.secret WHERE id=1;
  RETURN expiry || '.' || encode(extensions.hmac(convert_to('maintenance:' || p_action || ':' || expiry,'UTF8'),k,'sha256'),'hex');
END $$;
REVOKE ALL ON FUNCTION public.issue_maintenance_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_maintenance_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_maintenance_token(p_action text,p_token text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE parts text[]; k bytea;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('editor-assets-cleanup','migrate-ai-images-to-storage')
    OR p_token IS NULL OR p_token !~ '^[0-9]{1,12}\.[a-f0-9]{64}$' THEN RETURN false; END IF;
  parts := string_to_array(p_token,'.');
  IF parts[1]::bigint <= extract(epoch FROM now()) OR parts[1]::bigint > extract(epoch FROM now()) + 301 THEN RETURN false; END IF;
  SELECT key INTO STRICT k FROM wallet_auth.secret WHERE id=1;
  RETURN parts[2] = encode(extensions.hmac(convert_to('maintenance:' || p_action || ':' || parts[1],'UTF8'),k,'sha256'),'hex');
END $$;
REVOKE ALL ON FUNCTION public.verify_maintenance_token(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_maintenance_token(text,text) TO service_role;

-- Update only existing schedules. Preserve their timing and enabled state.
DO $migration$
DECLARE job record; action text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  FOR job IN SELECT jobid,jobname FROM cron.job WHERE jobname IN ('editor-assets-cleanup-daily','migrate-ai-images-daily') LOOP
    action := CASE job.jobname WHEN 'editor-assets-cleanup-daily' THEN 'editor-assets-cleanup' ELSE 'migrate-ai-images-to-storage' END;
    PERFORM cron.alter_job(job.jobid, command := format($command$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-maintenance-token',public.issue_maintenance_token(%L)),
        body := '{}'::jsonb, timeout_milliseconds := 55000);
    $command$, 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/' || action || CASE WHEN action='migrate-ai-images-to-storage' THEN '?batch=10' ELSE '' END, action));
  END LOOP;
END $migration$;
