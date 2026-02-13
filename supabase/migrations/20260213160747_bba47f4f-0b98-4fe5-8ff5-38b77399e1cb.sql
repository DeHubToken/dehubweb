
-- Create tip_leaderboard_cache table for on-chain tip aggregations
CREATE TABLE public.tip_leaderboard_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  sent_total numeric NOT NULL DEFAULT 0,
  received_total numeric NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'all',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(wallet_address, chain_id, period)
);

-- Enable RLS
ALTER TABLE public.tip_leaderboard_cache ENABLE ROW LEVEL SECURITY;

-- Public read (leaderboard is public data)
CREATE POLICY "Tip leaderboard cache is publicly readable"
ON public.tip_leaderboard_cache
FOR SELECT
USING (true);

-- Create index for fast lookups by period
CREATE INDEX idx_tip_leaderboard_period ON public.tip_leaderboard_cache(period);
CREATE INDEX idx_tip_leaderboard_wallet ON public.tip_leaderboard_cache(wallet_address);
