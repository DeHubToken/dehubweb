-- 1
CREATE OR REPLACE FUNCTION public.touch_post_translation(p_text_hash text, p_target_lang text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.post_translations SET hit_count = hit_count + 1, last_used_at = now() WHERE text_hash = p_text_hash AND target_lang = p_target_lang AND (hit_count = 0 OR last_used_at < now() - interval '1 day');
$function$;

-- 2
CREATE OR REPLACE FUNCTION public.evict_stale_post_translations()
 RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH v AS (SELECT ctid FROM public.post_translations WHERE last_used_at < now() - interval '30 days' ORDER BY last_used_at LIMIT 200000), d AS (DELETE FROM public.post_translations t USING v WHERE t.ctid = v.ctid RETURNING 1) SELECT count(*) FROM d;
$function$;
REVOKE ALL ON FUNCTION public.evict_stale_post_translations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evict_stale_post_translations() TO service_role;

-- 3
CREATE OR REPLACE FUNCTION dex_private.sample_market_fallback()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
DECLARE last_observed numeric;
BEGIN
  SELECT (payload->>'observedAt')::numeric INTO last_observed FROM dex_private.market_state WHERE id;
  IF last_observed IS NOT NULL AND last_observed > extract(epoch FROM now()) - 90 THEN RETURN; END IF;
  IF NOT dex_private.market_wanted() THEN RETURN; END IF;
  PERFORM pg_sleep(15);
  PERFORM dex_private.sample_market();
END $function$;

-- 4
CREATE OR REPLACE FUNCTION dex_private.price_minutes_strip_positions()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  NEW.positions := '[]'::jsonb;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION dex_private.price_minutes_strip_positions() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS price_minutes_strip_positions ON dex_private.price_minutes;
CREATE TRIGGER price_minutes_strip_positions BEFORE INSERT ON dex_private.price_minutes
  FOR EACH ROW EXECUTE FUNCTION dex_private.price_minutes_strip_positions();

-- 5
CREATE OR REPLACE FUNCTION public.category_counts(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(name text, post_count bigint) LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select l.name, count(*)::bigint as post_count
  from public.category_post_log l
  where l.name is not null
    and l.posted_at >= coalesce(p_since, '-infinity'::timestamptz)
  group by l.name
  order by count(*) desc, l.name asc
$function$;

-- 6
DO $$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['idx_leaderboard_snapshots_account','idx_communities_slug','idx_feature_request_votes_feature_id','idx_leaderboard_cache_lookup','idx_ai_agents_api_key','idx_unsubscribe_tokens_token','idx_suppressed_emails_email','idx_premium_subscriptions_stripe_id','chess_moves_match_idx','idx_space_participants_space','idx_stage_reminders_space','transcript_translations_transcript_idx','user_wallet_passkeys_user_id_idx','idx_work_apps_job'] LOOP
    IF to_regclass('public.'||n) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = to_regclass('public.'||n)) THEN
      EXECUTE format('DROP INDEX IF EXISTS public.%I', n);
    END IF;
  END LOOP;
END $$;

-- 7
SELECT cron.schedule('cleanup-anonymous-post-views-daily', '35 3 * * *', 'SELECT public.cleanup_old_anonymous_post_views()');
SELECT cron.schedule('cleanup-edge-rate-limits-daily', '55 3 * * *', $$DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '2 days'$$);

-- 8
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('migrate-ai-images-daily','cleanup-net-http-response-daily','cleanup-story-views-weekly');

-- 9
SELECT cron.alter_job(jobid, command := regexp_replace(command, '[\s;]+$', '') || E'\n      WHERE ((SELECT last_read_at > now() - interval ''15 minutes'' FROM dex_private.market_readers WHERE id) OR extract(minute FROM now()) < 10);')
  FROM cron.job WHERE jobname = 'dex-pool-position-scan' AND command NOT LIKE '%market_readers%';

-- 10
DROP EXTENSION IF EXISTS pgstattuple;

-- 11
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.client_error_logs;
REVOKE ALL ON public.client_error_logs FROM anon, authenticated;
DROP POLICY IF EXISTS "Anyone can insert" ON public.category_post_log;
DROP POLICY IF EXISTS "Anyone can insert trending categories" ON public.trending_categories;
DROP POLICY IF EXISTS "Anyone can update trending categories" ON public.trending_categories;

-- 12
DROP POLICY IF EXISTS "Anyone can insert staking records" ON public.staking_records;
DROP POLICY IF EXISTS "Clients record withdrawals only" ON public.staking_records;
CREATE POLICY "Clients record withdrawals only" ON public.staking_records FOR INSERT TO anon, authenticated WITH CHECK (action = 'unstake' AND tx_hash ~* '^0x[0-9a-f]{64}$');

-- 13
DROP POLICY IF EXISTS "Owners can delete feature media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read on temp-compress" ON storage.objects;

-- 14
UPDATE public.transcripts SET status = 'failed', attempts = 5, last_attempt_at = now() WHERE status = 'pending' AND created_at < now() - interval '24 hours';

-- 15
ALTER TABLE IF EXISTS public.edge_rate_limits SET UNLOGGED;

-- 16
DROP FUNCTION IF EXISTS public.chess_settle_wagers(uuid);
DROP FUNCTION IF EXISTS public.get_community_role(uuid, text);
DROP TABLE IF EXISTS public.work_view_snapshots;

-- 17 (20260825140000_film_reviews.sql)
CREATE TABLE IF NOT EXISTS public.film_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  justwatch_id  text        NOT NULL,
  object_type   text        NOT NULL CHECK (object_type IN ('movie', 'show')),
  title         text        NOT NULL,
  poster        text,
  year          smallint,
  address       text        NOT NULL,
  rating        smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text        CHECK (body IS NULL OR char_length(body) <= 4000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT film_reviews_one_per_person UNIQUE (justwatch_id, object_type, address)
);
CREATE INDEX IF NOT EXISTS film_reviews_title_idx
  ON public.film_reviews (justwatch_id, object_type, created_at DESC);
CREATE INDEX IF NOT EXISTS film_reviews_address_idx
  ON public.film_reviews (address, created_at DESC);
ALTER TABLE public.film_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS film_reviews_public_read ON public.film_reviews;
CREATE POLICY film_reviews_public_read
  ON public.film_reviews FOR SELECT
  USING (true);
COMMENT ON TABLE public.film_reviews IS
  'User ratings and reviews of /cinema titles, keyed on the JustWatch id. Public read; writes only via the film-reviews edge function.';

-- 18 (recount_space from 20260819180000_stage_write_policies.sql)
CREATE OR REPLACE FUNCTION public.recount_space(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.audio_spaces s
  SET listener_count = (
        SELECT count(*) FROM public.space_participants p
        WHERE p.space_id = s.id AND p.role = 'listener' AND p.left_at IS NULL
      ),
      speaker_count = (
        SELECT count(*) FROM public.space_participants p
        WHERE p.space_id = s.id AND p.role IN ('host', 'speaker') AND p.left_at IS NULL
      )
  WHERE s.id = p_space_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recount_space(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recount_space(uuid) TO anon, authenticated;

-- 19
CREATE INDEX IF NOT EXISTS custom_notifications_lower_recipient_created_idx ON public.custom_notifications (lower(recipient_address), created_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_lower_wallet_updated_idx ON public.ai_conversations (lower(wallet_address), updated_at DESC);

-- 20
CREATE OR REPLACE FUNCTION public.call_sessions_freeze_parties()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.caller_address IS DISTINCT FROM OLD.caller_address
     OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address
     OR NEW.call_type IS DISTINCT FROM OLD.call_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'call parties are fixed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS call_sessions_freeze_parties ON public.call_sessions;
CREATE TRIGGER call_sessions_freeze_parties BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.call_sessions_freeze_parties();