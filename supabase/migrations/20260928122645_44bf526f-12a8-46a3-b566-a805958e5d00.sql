CREATE OR REPLACE FUNCTION public.ads_estimate_audience(p_targeting jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest date;
  v_tiers text[];
  v_langs text[];
  v_communities uuid[];
  v_behaviors text[];
  v_follower_min int;
  v_follower_max int;
  v_premium boolean;
  v_total bigint;
  v_by_tier jsonb;
BEGIN
  SELECT max(snapshot_date) INTO v_latest FROM leaderboard_snapshots;
  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('audience', 0, 'byTier', '{}'::jsonb);
  END IF;

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
        WHEN balance >= 50000000 THEN 'Megalodon'
        WHEN balance >= 25000000 THEN 'Blue Whale'
        WHEN balance >= 10000000 THEN 'Killer Whale'
        WHEN balance >= 5000000  THEN 'Great White Shark'
        WHEN balance >= 3000000  THEN 'Tiger Shark'
        WHEN balance >= 2000000  THEN 'Dolphin'
        WHEN balance >= 1000000  THEN 'Crocodile'
        WHEN balance >= 500000   THEN 'Octopus'
        WHEN balance >= 250000   THEN 'King Cobra'
        WHEN balance >= 100000   THEN 'Giant Tortoise'
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

GRANT EXECUTE ON FUNCTION public.ads_estimate_audience(jsonb) TO anon, authenticated;

UPDATE public.ad_campaigns
SET targeting = jsonb_set(
      targeting,
      '{tiers}',
      (
        SELECT jsonb_agg(
          CASE t
            WHEN 'Tortoise' THEN 'Giant Tortoise'
            WHEN 'Cobra'    THEN 'King Cobra'
            ELSE t
          END
        )
        FROM jsonb_array_elements_text(targeting -> 'tiers') AS t
      )
    ),
    updated_at = now()
WHERE jsonb_typeof(targeting -> 'tiers') = 'array'
  AND (targeting -> 'tiers') ?| array['Tortoise', 'Cobra'];