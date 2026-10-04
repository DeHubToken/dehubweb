ALTER TABLE public.ad_earnings ADD COLUMN total_paid_usd numeric(14,6) NOT NULL DEFAULT 0
  CHECK (total_paid_usd >= 0 AND total_paid_usd <= total_earned_usd);

CREATE TABLE public.ad_creator_support_sessions (
  id uuid PRIMARY KEY,
  viewer_wallet text NOT NULL,
  creator_wallet text NOT NULL,
  post_id text NOT NULL,
  campaign_id uuid NOT NULL,
  creative_id uuid NOT NULL,
  viewer_tier text NOT NULL,
  price_usd numeric(14,6) NOT NULL CHECK (price_usd > 0),
  creator_share_usd numeric(14,6) NOT NULL CHECK (creator_share_usd > 0 AND creator_share_usd <= price_usd),
  watched_seconds numeric NOT NULL DEFAULT 0,
  reported_seconds numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  progress_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  credited_at timestamptz,
  CHECK (viewer_wallet <> creator_wallet)
);
ALTER TABLE public.ad_creator_support_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ad_creator_support_viewer_idx ON public.ad_creator_support_sessions(viewer_wallet, credited_at);

-- Only the authenticated edge endpoint can advance a session or spend credit.
CREATE OR REPLACE FUNCTION public.ads_advance_creator_support(p_session uuid, p_viewer text, p_seconds numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s ad_creator_support_sessions%ROWTYPE;
  c ad_campaigns%ROWTYPE;
  a ad_accounts%ROWTYPE;
  elapsed numeric;
  delta numeric;
  daily_spend numeric;
  frequency integer;
  billed jsonb;
BEGIN
  IF p_seconds IS NULL OR p_seconds < 0 OR p_seconds > 60 THEN
    RETURN jsonb_build_object('error', 'Invalid playback progress.');
  END IF;
  SELECT * INTO s FROM ad_creator_support_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.viewer_wallet <> lower(p_viewer) THEN
    RETURN jsonb_build_object('error', 'Watch session not found.');
  END IF;
  IF s.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('credited', true, 'creatorShareUsd', s.creator_share_usd, 'watchedSeconds', 30);
  END IF;
  IF s.expires_at <= now() THEN RETURN jsonb_build_object('error', 'Watch session expired.'); END IF;
  elapsed := greatest(0, extract(epoch FROM clock_timestamp() - s.progress_at));
  -- Progress beyond real elapsed time, seeks and long unattended gaps cannot
  -- finish a session. Clients report only foreground, unpaused playback.
  delta := least(5, elapsed, greatest(0, p_seconds - s.reported_seconds));
  UPDATE ad_creator_support_sessions SET
    watched_seconds = least(30, watched_seconds + delta),
    reported_seconds = greatest(reported_seconds, p_seconds), progress_at = clock_timestamp()
  WHERE id = p_session RETURNING * INTO s;
  IF s.watched_seconds < 30 THEN
    RETURN jsonb_build_object('credited', false, 'watchedSeconds', s.watched_seconds);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('creator-support:' || s.viewer_wallet, 0));
  IF (SELECT count(*) FROM ad_creator_support_sessions
      WHERE viewer_wallet = s.viewer_wallet AND credited_at >= date_trunc('day', now())) >= 5 THEN
    RETURN jsonb_build_object('error', 'Daily creator support limit reached.');
  END IF;
  SELECT * INTO c FROM ad_campaigns WHERE id = s.campaign_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'active' OR c.start_at > now() OR c.end_at <= now()
     OR c.targeting->>'creatorSupport' IS DISTINCT FROM 'true'
     OR c.wallet_address IN (s.viewer_wallet, s.creator_wallet)
     OR c.spent_usd + s.price_usd > c.total_budget_usd THEN
    RETURN jsonb_build_object('error', 'This ad is no longer available.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ad_creatives WHERE id = s.creative_id AND campaign_id = c.id
      AND status = 'approved' AND kind = 'video' AND duration_seconds >= 30 AND media_url IS NOT NULL) THEN
    RETURN jsonb_build_object('error', 'This video ad is no longer approved.');
  END IF;
  SELECT * INTO a FROM ad_accounts WHERE wallet_address = c.wallet_address FOR UPDATE;
  IF NOT FOUND OR a.status <> 'active' OR a.balance_usd < s.price_usd THEN
    RETURN jsonb_build_object('error', 'This ad has no remaining budget.');
  END IF;
  SELECT coalesce(sum(spend_usd), 0) INTO daily_spend FROM ad_daily_stats WHERE campaign_id = c.id AND day = current_date;
  SELECT coalesce(impressions, 0) INTO frequency FROM ad_frequency
    WHERE campaign_id = c.id AND viewer_key = s.viewer_wallet AND day = current_date;
  IF daily_spend + s.price_usd > c.daily_budget_usd OR coalesce(frequency,0) >= c.frequency_cap THEN
    RETURN jsonb_build_object('error', 'This ad has reached its daily limit.');
  END IF;

  -- The existing spend engine credits the nominated beneficiary. Keep the
  -- event's viewer identity separate from the creator receiving the share.
  billed := ads_track_impression(s.id, c.id, s.creative_id, s.viewer_wallet,
    s.creator_wallet, s.viewer_tier, 'creator-support', s.price_usd, s.creator_share_usd);
  IF billed->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Creator support billing failed';
  END IF;
  UPDATE ad_events SET viewer_wallet = s.viewer_wallet WHERE serve_id = s.id AND event_type = 'impression';
  UPDATE ad_creator_support_sessions SET credited_at = clock_timestamp() WHERE id = s.id;
  RETURN jsonb_build_object('credited', true, 'creatorShareUsd', s.creator_share_usd, 'watchedSeconds', 30);
END;
$$;
REVOKE ALL ON FUNCTION public.ads_advance_creator_support(uuid,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ads_advance_creator_support(uuid,text,numeric) TO service_role;
