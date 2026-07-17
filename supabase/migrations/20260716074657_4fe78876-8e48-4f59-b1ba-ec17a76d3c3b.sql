-- POVR Ads System — tables, RLS, triggers, RPCs
CREATE OR REPLACE FUNCTION public.ads_lower_wallet()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.wallet_address := lower(NEW.wallet_address); RETURN NEW; END; $$;

CREATE TABLE public.ad_accounts (
  wallet_address      text PRIMARY KEY,
  company_name        text,
  website             text,
  balance_usd         numeric(14,6) NOT NULL DEFAULT 0,
  total_deposited_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_spent_usd     numeric(14,6) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_accounts owner select" ON public.ad_accounts
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());
CREATE POLICY "ad_accounts owner insert" ON public.ad_accounts
  FOR INSERT WITH CHECK (
    lower(wallet_address) = public.get_request_wallet_address()
    AND balance_usd = 0 AND total_deposited_usd = 0 AND total_spent_usd = 0
    AND status = 'active'
  );
CREATE POLICY "ad_accounts owner update" ON public.ad_accounts
  FOR UPDATE USING (lower(wallet_address) = public.get_request_wallet_address());
GRANT SELECT ON public.ad_accounts TO authenticated, anon;
GRANT INSERT (wallet_address, company_name, website) ON public.ad_accounts TO authenticated, anon;
GRANT UPDATE (company_name, website) ON public.ad_accounts TO authenticated, anon;
CREATE TRIGGER ad_accounts_lower_wallet BEFORE INSERT OR UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ads_lower_wallet();
CREATE TRIGGER ad_accounts_updated_at BEFORE UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ad_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  tx_hash        text NOT NULL UNIQUE,
  chain          text NOT NULL CHECK (chain IN ('Base','BNB')),
  dhb_amount     numeric(30,10) NOT NULL,
  dhb_price_usd  numeric(18,10) NOT NULL,
  usd_value      numeric(14,6) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_payments owner select" ON public.ad_payments
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());
GRANT SELECT ON public.ad_payments TO authenticated, anon;
CREATE INDEX ad_payments_wallet_idx ON public.ad_payments (wallet_address, created_at DESC);

CREATE TABLE public.ad_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text NOT NULL,
  name             text NOT NULL,
  objective        text NOT NULL DEFAULT 'awareness' CHECK (objective IN ('awareness','traffic','engagement')),
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','pending_review','active','paused','rejected','completed','archived')),
  review_note      text,
  approved_at      timestamptz,
  daily_budget_usd numeric(14,6) NOT NULL CHECK (daily_budget_usd >= 1),
  total_budget_usd numeric(14,6) NOT NULL CHECK (total_budget_usd >= 1),
  spent_usd        numeric(14,6) NOT NULL DEFAULT 0,
  start_at         timestamptz NOT NULL DEFAULT now(),
  end_at           timestamptz,
  targeting        jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequency_cap    int NOT NULL DEFAULT 4 CHECK (frequency_cap BETWEEN 1 AND 20),
  cta_url          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_campaigns owner select" ON public.ad_campaigns
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());
CREATE POLICY "ad_campaigns owner insert" ON public.ad_campaigns
  FOR INSERT WITH CHECK (
    lower(wallet_address) = public.get_request_wallet_address()
    AND status IN ('draft','pending_review')
  );
CREATE POLICY "ad_campaigns owner update" ON public.ad_campaigns
  FOR UPDATE USING (lower(wallet_address) = public.get_request_wallet_address());
CREATE POLICY "ad_campaigns owner delete draft" ON public.ad_campaigns
  FOR DELETE USING (
    lower(wallet_address) = public.get_request_wallet_address()
    AND status = 'draft' AND spent_usd = 0
  );
GRANT SELECT, DELETE ON public.ad_campaigns TO authenticated, anon;
GRANT INSERT (wallet_address, name, objective, status, daily_budget_usd, total_budget_usd,
              start_at, end_at, targeting, frequency_cap, cta_url)
  ON public.ad_campaigns TO authenticated, anon;
GRANT UPDATE (name, objective, status, daily_budget_usd, total_budget_usd,
              start_at, end_at, targeting, frequency_cap, cta_url)
  ON public.ad_campaigns TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.ads_campaign_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller text := public.get_request_wallet_address();
BEGIN
  IF caller IS NULL OR caller = '' THEN RETURN NEW; END IF;
  NEW.spent_usd   := OLD.spent_usd;
  NEW.review_note := OLD.review_note;
  NEW.approved_at := OLD.approved_at;
  NEW.wallet_address := OLD.wallet_address;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'          AND NEW.status = 'pending_review') OR
      (OLD.status = 'pending_review' AND NEW.status = 'draft')          OR
      (OLD.status = 'rejected'       AND NEW.status IN ('draft','pending_review')) OR
      (OLD.status = 'active'         AND NEW.status = 'paused')         OR
      (OLD.status = 'paused'         AND NEW.status = 'active' AND OLD.approved_at IS NOT NULL) OR
      (OLD.status IN ('draft','pending_review','rejected','paused','completed') AND NEW.status = 'archived')
    ) THEN
      RAISE EXCEPTION 'Invalid campaign status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF NEW.total_budget_usd < OLD.spent_usd THEN
    RAISE EXCEPTION 'Total budget cannot be set below the amount already spent';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER ad_campaigns_guard BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.ads_campaign_guard();
CREATE TRIGGER ad_campaigns_lower_wallet BEFORE INSERT OR UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.ads_lower_wallet();
CREATE TRIGGER ad_campaigns_updated_at BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX ad_campaigns_wallet_idx ON public.ad_campaigns (wallet_address, created_at DESC);
CREATE INDEX ad_campaigns_serving_idx ON public.ad_campaigns (status, start_at) WHERE status = 'active';

CREATE TABLE public.ad_creatives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  wallet_address   text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('image','video','text')),
  media_url        text,
  thumbnail_url    text,
  headline         text NOT NULL,
  body             text,
  cta_label        text NOT NULL DEFAULT 'Learn more',
  cta_url          text,
  width            int,
  height           int,
  duration_seconds numeric(10,2),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_creatives owner select" ON public.ad_creatives
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());
CREATE POLICY "ad_creatives owner insert" ON public.ad_creatives
  FOR INSERT WITH CHECK (
    lower(wallet_address) = public.get_request_wallet_address()
    AND EXISTS (
      SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND lower(c.wallet_address) = public.get_request_wallet_address()
    )
  );
CREATE POLICY "ad_creatives owner update" ON public.ad_creatives
  FOR UPDATE USING (lower(wallet_address) = public.get_request_wallet_address());
CREATE POLICY "ad_creatives owner delete" ON public.ad_creatives
  FOR DELETE USING (lower(wallet_address) = public.get_request_wallet_address());
GRANT SELECT, DELETE ON public.ad_creatives TO authenticated, anon;
GRANT INSERT (campaign_id, wallet_address, kind, media_url, thumbnail_url, headline, body,
              cta_label, cta_url, width, height, duration_seconds)
  ON public.ad_creatives TO authenticated, anon;
GRANT UPDATE (kind, media_url, thumbnail_url, headline, body, cta_label, cta_url,
              width, height, duration_seconds)
  ON public.ad_creatives TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.ads_creative_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller text := public.get_request_wallet_address();
BEGIN
  IF caller IS NULL OR caller = '' THEN RETURN NEW; END IF;
  NEW.status := OLD.status;
  NEW.review_note := OLD.review_note;
  NEW.wallet_address := OLD.wallet_address;
  NEW.campaign_id := OLD.campaign_id;
  IF (NEW.media_url  IS DISTINCT FROM OLD.media_url)
   OR (NEW.headline  IS DISTINCT FROM OLD.headline)
   OR (NEW.body      IS DISTINCT FROM OLD.body)
   OR (NEW.cta_url   IS DISTINCT FROM OLD.cta_url)
   OR (NEW.cta_label IS DISTINCT FROM OLD.cta_label)
   OR (NEW.kind      IS DISTINCT FROM OLD.kind) THEN
    NEW.status := 'pending';
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER ad_creatives_guard BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.ads_creative_guard();
CREATE TRIGGER ad_creatives_lower_wallet BEFORE INSERT OR UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.ads_lower_wallet();
CREATE TRIGGER ad_creatives_updated_at BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX ad_creatives_campaign_idx ON public.ad_creatives (campaign_id);
CREATE INDEX ad_creatives_review_idx ON public.ad_creatives (status) WHERE status = 'pending';

CREATE TABLE public.ad_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serve_id         uuid NOT NULL,
  campaign_id      uuid NOT NULL,
  creative_id      uuid NOT NULL,
  event_type       text NOT NULL CHECK (event_type IN ('impression','click')),
  viewer_wallet    text,
  viewer_key       text NOT NULL,
  viewer_tier      text NOT NULL DEFAULT 'none',
  surface          text NOT NULL DEFAULT 'home',
  price_usd        numeric(14,6) NOT NULL DEFAULT 0,
  viewer_share_usd numeric(14,6) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_events campaign owner select" ON public.ad_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = campaign_id AND lower(c.wallet_address) = public.get_request_wallet_address())
  );
GRANT SELECT ON public.ad_events TO authenticated, anon;
CREATE UNIQUE INDEX ad_events_serve_dedupe ON public.ad_events (serve_id, event_type);
CREATE INDEX ad_events_campaign_idx ON public.ad_events (campaign_id, created_at DESC);

CREATE TABLE public.ad_daily_stats (
  campaign_id      uuid NOT NULL,
  creative_id      uuid NOT NULL,
  day              date NOT NULL,
  impressions      int NOT NULL DEFAULT 0,
  clicks           int NOT NULL DEFAULT 0,
  spend_usd        numeric(14,6) NOT NULL DEFAULT 0,
  viewer_share_usd numeric(14,6) NOT NULL DEFAULT 0,
  by_tier          jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (campaign_id, creative_id, day)
);
ALTER TABLE public.ad_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_daily_stats campaign owner select" ON public.ad_daily_stats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = campaign_id AND lower(c.wallet_address) = public.get_request_wallet_address())
  );
GRANT SELECT ON public.ad_daily_stats TO authenticated, anon;

CREATE TABLE public.ad_frequency (
  viewer_key  text NOT NULL,
  campaign_id uuid NOT NULL,
  day         date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  PRIMARY KEY (viewer_key, campaign_id, day)
);
ALTER TABLE public.ad_frequency ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ad_earnings (
  wallet_address   text PRIMARY KEY,
  total_earned_usd numeric(14,6) NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_earnings owner select" ON public.ad_earnings
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());
GRANT SELECT ON public.ad_earnings TO authenticated, anon;

CREATE TABLE public.ad_audience_members (
  campaign_id    uuid NOT NULL,
  wallet_address text NOT NULL,
  source         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, wallet_address)
);
ALTER TABLE public.ad_audience_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_audience_members campaign owner select" ON public.ad_audience_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = campaign_id AND lower(c.wallet_address) = public.get_request_wallet_address())
  );
GRANT SELECT ON public.ad_audience_members TO authenticated, anon;

CREATE TABLE public.ad_config (key text PRIMARY KEY, value jsonb NOT NULL);
ALTER TABLE public.ad_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.ad_config (key, value) VALUES
  ('viewer_share_bps', '5000'::jsonb),
  ('min_topup_usd', '25'::jsonb),
  ('serve_token_ttl_seconds', '1800'::jsonb),
  ('default_frequency_cap', '4'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- storage.objects policies for the ad-media bucket (bucket itself was created
-- via the storage tool as private — workspace policy blocks public buckets).
CREATE POLICY "ad-media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ad-media');
CREATE POLICY "ad-media upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ad-media');
CREATE POLICY "ad-media update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'ad-media');
CREATE POLICY "ad-media delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'ad-media');

CREATE OR REPLACE FUNCTION public.ads_topup_credit(
  p_wallet text, p_tx_hash text, p_chain text,
  p_dhb numeric, p_price numeric, p_usd numeric
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  INSERT INTO ad_payments (wallet_address, tx_hash, chain, dhb_amount, dhb_price_usd, usd_value)
  VALUES (lower(p_wallet), p_tx_hash, p_chain, p_dhb, p_price, p_usd)
  ON CONFLICT (tx_hash) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'TX_ALREADY_CREDITED'; END IF;
  INSERT INTO ad_accounts (wallet_address, balance_usd, total_deposited_usd)
  VALUES (lower(p_wallet), p_usd, p_usd)
  ON CONFLICT (wallet_address) DO UPDATE SET
    balance_usd = ad_accounts.balance_usd + EXCLUDED.balance_usd,
    total_deposited_usd = ad_accounts.total_deposited_usd + EXCLUDED.total_deposited_usd,
    updated_at = now()
  RETURNING balance_usd INTO v_balance;
  RETURN v_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.ads_track_impression(
  p_serve_id uuid, p_campaign uuid, p_creative uuid,
  p_viewer_key text, p_viewer_wallet text, p_tier text,
  p_surface text, p_price numeric, p_share numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_spent numeric; v_budget numeric; v_owner text;
BEGIN
  INSERT INTO ad_events (serve_id, campaign_id, creative_id, event_type, viewer_wallet,
                         viewer_key, viewer_tier, surface, price_usd, viewer_share_usd)
  VALUES (p_serve_id, p_campaign, p_creative, 'impression', nullif(lower(coalesce(p_viewer_wallet,'')),''),
          p_viewer_key, p_tier, p_surface, p_price, p_share)
  ON CONFLICT (serve_id, event_type) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;

  UPDATE ad_campaigns SET spent_usd = spent_usd + p_price
  WHERE id = p_campaign
  RETURNING spent_usd, total_budget_usd, wallet_address INTO v_spent, v_budget, v_owner;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('error', 'campaign_missing'); END IF;
  IF v_spent >= v_budget THEN
    UPDATE ad_campaigns SET status = 'completed' WHERE id = p_campaign AND status = 'active';
  END IF;

  UPDATE ad_accounts
  SET balance_usd = balance_usd - p_price,
      total_spent_usd = total_spent_usd + p_price,
      updated_at = now()
  WHERE wallet_address = v_owner;

  INSERT INTO ad_frequency (viewer_key, campaign_id, day, impressions)
  VALUES (p_viewer_key, p_campaign, current_date, 1)
  ON CONFLICT (viewer_key, campaign_id, day)
  DO UPDATE SET impressions = ad_frequency.impressions + 1;

  INSERT INTO ad_daily_stats AS s (campaign_id, creative_id, day, impressions, clicks, spend_usd, viewer_share_usd, by_tier)
  VALUES (p_campaign, p_creative, current_date, 1, 0, p_price, p_share,
          jsonb_build_object(p_tier, jsonb_build_object('impressions', 1, 'clicks', 0, 'spend', p_price)))
  ON CONFLICT (campaign_id, creative_id, day) DO UPDATE SET
    impressions = s.impressions + 1,
    spend_usd = s.spend_usd + EXCLUDED.spend_usd,
    viewer_share_usd = s.viewer_share_usd + EXCLUDED.viewer_share_usd,
    by_tier = jsonb_set(coalesce(s.by_tier, '{}'::jsonb), ARRAY[p_tier],
      jsonb_build_object(
        'impressions', coalesce((s.by_tier -> p_tier ->> 'impressions')::int, 0) + 1,
        'clicks',      coalesce((s.by_tier -> p_tier ->> 'clicks')::int, 0),
        'spend',       coalesce((s.by_tier -> p_tier ->> 'spend')::numeric, 0) + p_price
      ));

  IF p_viewer_wallet IS NOT NULL AND p_viewer_wallet <> '' AND p_share > 0 THEN
    INSERT INTO ad_earnings (wallet_address, total_earned_usd)
    VALUES (lower(p_viewer_wallet), p_share)
    ON CONFLICT (wallet_address) DO UPDATE SET
      total_earned_usd = ad_earnings.total_earned_usd + p_share,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'spent', v_spent, 'budget', v_budget);
END; $$;

CREATE OR REPLACE FUNCTION public.ads_track_click(
  p_serve_id uuid, p_campaign uuid, p_creative uuid,
  p_viewer_key text, p_viewer_wallet text, p_tier text, p_surface text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO ad_events (serve_id, campaign_id, creative_id, event_type, viewer_wallet,
                         viewer_key, viewer_tier, surface, price_usd, viewer_share_usd)
  VALUES (p_serve_id, p_campaign, p_creative, 'click', nullif(lower(coalesce(p_viewer_wallet,'')),''),
          p_viewer_key, p_tier, p_surface, 0, 0)
  ON CONFLICT (serve_id, event_type) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;

  INSERT INTO ad_daily_stats AS s (campaign_id, creative_id, day, impressions, clicks, spend_usd, viewer_share_usd, by_tier)
  VALUES (p_campaign, p_creative, current_date, 0, 1, 0, 0,
          jsonb_build_object(p_tier, jsonb_build_object('impressions', 0, 'clicks', 1, 'spend', 0)))
  ON CONFLICT (campaign_id, creative_id, day) DO UPDATE SET
    clicks = s.clicks + 1,
    by_tier = jsonb_set(coalesce(s.by_tier, '{}'::jsonb), ARRAY[p_tier],
      jsonb_build_object(
        'impressions', coalesce((s.by_tier -> p_tier ->> 'impressions')::int, 0),
        'clicks',      coalesce((s.by_tier -> p_tier ->> 'clicks')::int, 0) + 1,
        'spend',       coalesce((s.by_tier -> p_tier ->> 'spend')::numeric, 0)
      ));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.ads_estimate_audience(p_targeting jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest date; v_tiers text[]; v_langs text[]; v_communities uuid[]; v_behaviors text[];
  v_follower_min int; v_follower_max int; v_premium boolean;
  v_total bigint; v_by_tier jsonb;
BEGIN
  SELECT max(snapshot_date) INTO v_latest FROM leaderboard_snapshots;
  IF v_latest IS NULL THEN RETURN jsonb_build_object('audience', 0, 'byTier', '{}'::jsonb); END IF;

  v_tiers := CASE WHEN p_targeting ? 'tiers'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting -> 'tiers')) ELSE NULL END;
  v_langs := CASE WHEN p_targeting ? 'languages'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting -> 'languages')) ELSE NULL END;
  v_communities := CASE WHEN p_targeting ? 'communities'
    THEN ARRAY(SELECT (jsonb_array_elements_text(p_targeting -> 'communities'))::uuid) ELSE NULL END;
  v_behaviors := CASE WHEN p_targeting ? 'behaviors'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_targeting -> 'behaviors')) ELSE NULL END;
  v_follower_min := (p_targeting ->> 'followerMin')::int;
  v_follower_max := (p_targeting ->> 'followerMax')::int;
  v_premium := (p_targeting ->> 'premium')::boolean;

  WITH latest AS (
    SELECT lower(account) AS account, balance, coalesce(followers, 0) AS followers,
      CASE
        WHEN balance >= 50000000 THEN 'Meglodon'
        WHEN balance >= 25000000 THEN 'Blue Whale'
        WHEN balance >= 10000000 THEN 'Great White Shark'
        WHEN balance >= 5000000  THEN 'Killer Whale'
        WHEN balance >= 3000000  THEN 'Tiger Shark'
        WHEN balance >= 2000000  THEN 'Dolphin'
        WHEN balance >= 1000000  THEN 'Crocodite'
        WHEN balance >= 500000   THEN 'Octopus'
        WHEN balance >= 250000   THEN 'Cobra'
        WHEN balance >= 100000   THEN 'Tortoise'
        WHEN balance >= 50000    THEN 'Piranha'
        WHEN balance >= 25000    THEN 'Lobster'
        WHEN balance >= 10000    THEN 'Crab'
        ELSE 'none'
      END AS tier
    FROM leaderboard_snapshots WHERE snapshot_date = v_latest
  ),
  filtered AS (
    SELECT * FROM latest l
    WHERE (v_tiers IS NULL OR l.tier = ANY(v_tiers))
      AND (v_follower_min IS NULL OR l.followers >= v_follower_min)
      AND (v_follower_max IS NULL OR l.followers <= v_follower_max)
      AND (v_langs IS NULL OR EXISTS (
        SELECT 1 FROM user_display_preferences p
        WHERE lower(p.wallet_address) = l.account AND p.preferences ->> 'language' = ANY(v_langs)))
      AND (v_premium IS NOT TRUE OR EXISTS (
        SELECT 1 FROM premium_subscriptions ps
        WHERE lower(ps.wallet_address) = l.account AND ps.status IN ('active','trialing')))
      AND (v_communities IS NULL OR EXISTS (
        SELECT 1 FROM community_members cm
        WHERE lower(cm.wallet_address) = l.account AND cm.community_id = ANY(v_communities) AND cm.status = 'active'))
      AND (v_behaviors IS NULL OR (
        (NOT 'tippers' = ANY(v_behaviors) OR EXISTS (
          SELECT 1 FROM tip_records t WHERE lower(t.sender_address) = l.account))
        AND (NOT 'ppv_buyers' = ANY(v_behaviors) OR EXISTS (
          SELECT 1 FROM ppv_purchases pp WHERE lower(pp.buyer_address) = l.account))
        AND (NOT 'stakers' = ANY(v_behaviors) OR EXISTS (
          SELECT 1 FROM staking_records sr WHERE lower(sr.wallet_address) = l.account AND sr.action = 'stake'))
        AND (NOT 'streamers' = ANY(v_behaviors) OR EXISTS (
          SELECT 1 FROM live_stream_sessions ls WHERE lower(ls.address) = l.account))
      ))
  )
  SELECT coalesce(sum(cnt), 0), coalesce(jsonb_object_agg(tier, cnt), '{}'::jsonb)
  INTO v_total, v_by_tier
  FROM (SELECT tier, count(*) AS cnt FROM filtered GROUP BY tier) g;

  RETURN jsonb_build_object('audience', coalesce(v_total, 0), 'byTier', coalesce(v_by_tier, '{}'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.ads_topup_credit(text, text, text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ads_track_impression(uuid, uuid, uuid, text, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ads_track_click(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ads_estimate_audience(jsonb) TO anon, authenticated;
