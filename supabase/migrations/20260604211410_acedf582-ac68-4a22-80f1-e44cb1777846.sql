
-- Launchpad Phase 1 tables

CREATE TABLE public.launchpad_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id int NOT NULL DEFAULT 8453,
  mint_address text,
  creator_address text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  image_url text,
  description text,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  curve_type text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'bonding' CHECK (status IN ('bonding','graduating','graduated')),
  supply_sold numeric NOT NULL DEFAULT 0,
  market_cap_usd numeric NOT NULL DEFAULT 0,
  volume_24h numeric NOT NULL DEFAULT 0,
  progress_bps int NOT NULL DEFAULT 0,
  graduation_target_usd numeric NOT NULL DEFAULT 42000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_launchpad_tokens_status ON public.launchpad_tokens(status);
CREATE INDEX idx_launchpad_tokens_created_at ON public.launchpad_tokens(created_at DESC);
CREATE INDEX idx_launchpad_tokens_creator ON public.launchpad_tokens(lower(creator_address));
CREATE INDEX idx_launchpad_tokens_symbol ON public.launchpad_tokens(lower(symbol));

GRANT SELECT ON public.launchpad_tokens TO anon;
GRANT SELECT, INSERT, UPDATE ON public.launchpad_tokens TO authenticated;
GRANT ALL ON public.launchpad_tokens TO service_role;

ALTER TABLE public.launchpad_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view launchpad tokens" ON public.launchpad_tokens
  FOR SELECT USING (true);
CREATE POLICY "Creators can insert their own tokens" ON public.launchpad_tokens
  FOR INSERT WITH CHECK (lower(creator_address) = get_request_wallet_address());
CREATE POLICY "Creators can update their own tokens" ON public.launchpad_tokens
  FOR UPDATE USING (lower(creator_address) = get_request_wallet_address());

CREATE TRIGGER trg_launchpad_tokens_updated_at
  BEFORE UPDATE ON public.launchpad_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.launchpad_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.launchpad_tokens(id) ON DELETE CASCADE,
  trader_address text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  dhb_in numeric NOT NULL,
  tokens_out numeric NOT NULL,
  price_per_token numeric NOT NULL,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_launchpad_trades_token ON public.launchpad_trades(token_id, created_at DESC);
CREATE INDEX idx_launchpad_trades_created_at ON public.launchpad_trades(created_at DESC);

GRANT SELECT ON public.launchpad_trades TO anon;
GRANT SELECT, INSERT ON public.launchpad_trades TO authenticated;
GRANT ALL ON public.launchpad_trades TO service_role;

ALTER TABLE public.launchpad_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view launchpad trades" ON public.launchpad_trades
  FOR SELECT USING (true);
CREATE POLICY "Traders can insert their own trades" ON public.launchpad_trades
  FOR INSERT WITH CHECK (lower(trader_address) = get_request_wallet_address());

ALTER PUBLICATION supabase_realtime ADD TABLE public.launchpad_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.launchpad_tokens;

-- Recompute aggregates after each trade
CREATE OR REPLACE FUNCTION public.launchpad_recompute_token_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supply numeric;
  v_volume numeric;
  v_target numeric;
  v_last_price numeric;
  v_mcap numeric;
  v_progress int;
  v_status text;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN side='buy' THEN tokens_out ELSE -tokens_out END), 0),
    COALESCE(SUM(CASE WHEN created_at > now() - interval '24 hours' THEN dhb_in ELSE 0 END), 0)
  INTO v_supply, v_volume
  FROM public.launchpad_trades WHERE token_id = NEW.token_id;

  SELECT graduation_target_usd, status INTO v_target, v_status
  FROM public.launchpad_tokens WHERE id = NEW.token_id;

  v_last_price := NEW.price_per_token;
  -- Mock USD mcap: price * supply_sold * 1 (DHB≈$1 placeholder for Phase 1)
  v_mcap := GREATEST(v_supply, 0) * v_last_price;
  v_progress := LEAST(10000, GREATEST(0, FLOOR((v_mcap / NULLIF(v_target,0)) * 10000)::int));

  IF v_status = 'bonding' AND v_mcap >= v_target THEN
    v_status := 'graduating';
  END IF;

  UPDATE public.launchpad_tokens
  SET supply_sold = GREATEST(v_supply, 0),
      volume_24h = v_volume,
      market_cap_usd = v_mcap,
      progress_bps = v_progress,
      status = v_status,
      updated_at = now()
  WHERE id = NEW.token_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_launchpad_recompute
  AFTER INSERT ON public.launchpad_trades
  FOR EACH ROW EXECUTE FUNCTION public.launchpad_recompute_token_stats();
