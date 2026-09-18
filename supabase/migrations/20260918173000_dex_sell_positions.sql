-- Positions created by DeHub's DHB/USDC v4 Sell flow. The NFT and pool state
-- remain authoritative; this table is only a discovery index for /dex.
CREATE TABLE IF NOT EXISTS public.dex_sell_positions (
  chain_id integer NOT NULL CHECK (chain_id IN (56, 8453)),
  token_id text NOT NULL CHECK (token_id ~ '^[1-9][0-9]*$'),
  owner_address text NOT NULL CHECK (owner_address ~ '^0x[0-9a-fA-F]{40}$'),
  mint_tx_hash text NOT NULL CHECK (mint_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  dhb_amount numeric NOT NULL CHECK (dhb_amount > 0),
  min_usdc_per_dhb numeric NOT NULL CHECK (min_usdc_per_dhb > 0),
  max_usdc_per_dhb numeric NOT NULL CHECK (max_usdc_per_dhb > min_usdc_per_dhb),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_id),
  UNIQUE (chain_id, mint_tx_hash, token_id)
);

CREATE INDEX IF NOT EXISTS dex_sell_positions_recent_idx
  ON public.dex_sell_positions (created_at DESC);

ALTER TABLE public.dex_sell_positions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'dex_sell_positions' AND policyname = 'Anyone can view DHB sell positions') THEN
    CREATE POLICY "Anyone can view DHB sell positions"
      ON public.dex_sell_positions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'dex_sell_positions' AND policyname = 'Owners can index DHB sell positions') THEN
    CREATE POLICY "Owners can index DHB sell positions"
      ON public.dex_sell_positions FOR INSERT
      WITH CHECK (lower(owner_address) = public.get_request_wallet_address());
  END IF;
END $$;
