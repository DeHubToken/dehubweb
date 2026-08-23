-- Ad billing clamps: spend can never exceed prepaid budget or balance.
--
-- The old ads_track_impression inserted the billable event first and then
-- updated campaign spend and advertiser balance with no ceiling and no floor:
--
--   spent_usd  = spent_usd + p_price          -- runs past total_budget_usd
--   balance_usd = balance_usd - p_price       -- goes negative without complaint
--
-- so concurrent redemptions of harvested serve tokens could overshoot a
-- campaign's budget and book unbacked liability against an advertiser's
-- account. This version resolves the campaign and balance BEFORE recording
-- anything, charges only what remains (min of price, remaining budget,
-- remaining balance), refuses when nothing is chargeable, and clamps both
-- updates so neither can cross its bound.

CREATE OR REPLACE FUNCTION public.ads_track_impression(
  p_serve_id uuid, p_campaign uuid, p_creative uuid,
  p_viewer_key text, p_viewer_wallet text, p_tier text,
  p_surface text, p_price numeric, p_share numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status  text;
  v_budget  numeric;
  v_spent   numeric;
  v_owner   text;
  v_balance numeric;
  v_charge  numeric;
BEGIN
  SELECT c.status, c.total_budget_usd, c.spent_usd, c.wallet_address,
         coalesce(a.balance_usd, 0)
    INTO v_status, v_budget, v_spent, v_owner, v_balance
  FROM ad_campaigns c
  LEFT JOIN ad_accounts a ON a.wallet_address = c.wallet_address
  WHERE c.id = p_campaign;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('error', 'campaign_missing');
  END IF;

  -- Never charge more than the impression price, the budget left on the
  -- campaign, or the money left in the advertiser's account.
  v_charge := least(p_price, greatest(v_budget - v_spent, 0), greatest(v_balance, 0));

  IF v_status <> 'active' OR v_charge <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      CASE WHEN coalesce(v_balance, 0) <= 0 THEN 'insufficient_balance' ELSE 'budget_exhausted' END);
  END IF;

  INSERT INTO ad_events (serve_id, campaign_id, creative_id, event_type, viewer_wallet,
                         viewer_key, viewer_tier, surface, price_usd, viewer_share_usd)
  VALUES (p_serve_id, p_campaign, p_creative, 'impression', nullif(lower(coalesce(p_viewer_wallet,'')),''),
          p_viewer_key, p_tier, p_surface, v_charge, least(p_share, v_charge))
  ON CONFLICT (serve_id, event_type) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  UPDATE ad_campaigns
  SET spent_usd = spent_usd + v_charge,
      status = CASE WHEN spent_usd + v_charge >= total_budget_usd THEN 'completed' ELSE status END
  WHERE id = p_campaign;

  UPDATE ad_accounts
  SET balance_usd = greatest(balance_usd - v_charge, 0),
      total_spent_usd = total_spent_usd + v_charge,
      updated_at = now()
  WHERE wallet_address = v_owner;

  INSERT INTO ad_frequency (viewer_key, campaign_id, day, impressions)
  VALUES (p_viewer_key, p_campaign, current_date, 1)
  ON CONFLICT (viewer_key, campaign_id, day)
  DO UPDATE SET impressions = ad_frequency.impressions + 1;

  INSERT INTO ad_daily_stats AS s (campaign_id, creative_id, day, impressions, clicks, spend_usd, viewer_share_usd, by_tier)
  VALUES (p_campaign, p_creative, current_date, 1, 0, v_charge, least(p_share, v_charge),
          jsonb_build_object(p_tier, jsonb_build_object('impressions', 1, 'clicks', 0, 'spend', v_charge)))
  ON CONFLICT (campaign_id, creative_id, day) DO UPDATE SET
    impressions = s.impressions + 1,
    spend_usd = s.spend_usd + EXCLUDED.spend_usd,
    viewer_share_usd = s.viewer_share_usd + EXCLUDED.viewer_share_usd,
    by_tier = jsonb_set(
      coalesce(s.by_tier, '{}'::jsonb),
      ARRAY[p_tier],
      jsonb_build_object(
        'impressions', coalesce((s.by_tier -> p_tier ->> 'impressions')::int, 0) + 1,
        'clicks',      coalesce((s.by_tier -> p_tier ->> 'clicks')::int, 0),
        'spend',       coalesce((s.by_tier -> p_tier ->> 'spend')::numeric, 0) + v_charge
      )
    );

  IF p_viewer_wallet IS NOT NULL AND p_viewer_wallet <> '' AND least(p_share, v_charge) > 0 THEN
    INSERT INTO ad_earnings (wallet_address, total_earned_usd)
    VALUES (lower(p_viewer_wallet), least(p_share, v_charge))
    ON CONFLICT (wallet_address) DO UPDATE SET
      total_earned_usd = ad_earnings.total_earned_usd + least(p_share, v_charge),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'charged', v_charge);
END;
$$;
