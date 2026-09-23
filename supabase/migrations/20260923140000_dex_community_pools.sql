-- Community pools on /dex. Anyone can open one for any token on Base, Ethereum,
-- Robinhood Chain or Solana by paying the listing fee ($100 in DHB) to the
-- treasury. Rows are only ever written by the dex-pool-create edge function,
-- after the fee transfer is confirmed on chain; the chain itself stays the
-- authority for orders and trades, and these tables are the discovery index.

CREATE TABLE IF NOT EXISTS public.dex_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('base', 'ethereum', 'robinhood', 'solana')),
  -- EVM addresses are stored lowercase; Solana mints are case-sensitive base58.
  token_address text NOT NULL CHECK (
    (chain <> 'solana' AND token_address ~ '^0x[0-9a-f]{40}$') OR
    (chain = 'solana' AND token_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
  ),
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 32),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  decimals integer NOT NULL CHECK (decimals BETWEEN 0 AND 36),
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  creator_address text NOT NULL CHECK (creator_address ~ '^0x[0-9a-f]{40}$'),
  fee_tx_hash text NOT NULL UNIQUE CHECK (fee_tx_hash ~ '^0x[0-9a-f]{64}$'),
  fee_dhb numeric NOT NULL CHECK (fee_dhb > 0),
  fee_usd numeric NOT NULL CHECK (fee_usd > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, token_address)
);
CREATE INDEX IF NOT EXISTS dex_pools_recent_idx ON public.dex_pools (created_at DESC);

ALTER TABLE public.dex_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pools" ON public.dex_pools;
CREATE POLICY "Anyone can view DEX pools" ON public.dex_pools FOR SELECT USING (true);

-- The creator can change the pool's picture. Nothing else on the row moves.
CREATE OR REPLACE FUNCTION public.set_dex_pool_image(p_pool_id uuid, p_image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_image_url IS NOT NULL AND p_image_url !~ '^https://' THEN
    RAISE EXCEPTION 'Image must be an https URL';
  END IF;
  UPDATE public.dex_pools SET image_url = p_image_url
    WHERE id = p_pool_id AND creator_address = public.get_request_wallet_address();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the pool creator can change its image';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_dex_pool_image(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_dex_pool_image(uuid, text) TO anon, authenticated;

-- Limit orders placed through a community pool. On EVM chains `order_ref` is the
-- Uniswap v4 position NFT id; on Solana it is the Jupiter trigger order account.
CREATE TABLE IF NOT EXISTS public.dex_pool_orders (
  pool_id uuid NOT NULL REFERENCES public.dex_pools(id) ON DELETE CASCADE,
  order_ref text NOT NULL CHECK (char_length(order_ref) BETWEEN 1 AND 100),
  owner_address text NOT NULL CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  maker text NOT NULL CHECK (char_length(maker) BETWEEN 32 AND 44),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  tx_hash text NOT NULL CHECK (char_length(tx_hash) BETWEEN 64 AND 100),
  token_amount numeric NOT NULL CHECK (token_amount > 0),
  usd_amount numeric NOT NULL CHECK (usd_amount > 0),
  price numeric NOT NULL CHECK (price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, order_ref)
);
CREATE INDEX IF NOT EXISTS dex_pool_orders_recent_idx ON public.dex_pool_orders (pool_id, created_at DESC);

ALTER TABLE public.dex_pool_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pool orders" ON public.dex_pool_orders;
CREATE POLICY "Anyone can view DEX pool orders" ON public.dex_pool_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can index DEX pool orders" ON public.dex_pool_orders;
CREATE POLICY "Owners can index DEX pool orders" ON public.dex_pool_orders FOR INSERT
  WITH CHECK (owner_address = public.get_request_wallet_address());

-- Instant (market) buys and sells made through a community pool, for the
-- pool's trade history.
CREATE TABLE IF NOT EXISTS public.dex_pool_trades (
  tx_hash text PRIMARY KEY CHECK (char_length(tx_hash) BETWEEN 64 AND 100),
  pool_id uuid NOT NULL REFERENCES public.dex_pools(id) ON DELETE CASCADE,
  owner_address text NOT NULL CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  trader text NOT NULL CHECK (char_length(trader) BETWEEN 32 AND 44),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  token_amount numeric NOT NULL CHECK (token_amount > 0),
  usd_amount numeric NOT NULL CHECK (usd_amount > 0),
  price numeric NOT NULL CHECK (price > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dex_pool_trades_recent_idx ON public.dex_pool_trades (pool_id, created_at DESC);

ALTER TABLE public.dex_pool_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pool trades" ON public.dex_pool_trades;
CREATE POLICY "Anyone can view DEX pool trades" ON public.dex_pool_trades FOR SELECT USING (true);
DROP POLICY IF EXISTS "Traders can index DEX pool trades" ON public.dex_pool_trades;
CREATE POLICY "Traders can index DEX pool trades" ON public.dex_pool_trades FOR INSERT
  WITH CHECK (owner_address = public.get_request_wallet_address());

-- Pool pictures chosen by their creators.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dex-pool-images', 'dex-pool-images', true, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "dex-pool-images public read" ON storage.objects;
CREATE POLICY "dex-pool-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dex-pool-images');
DROP POLICY IF EXISTS "dex-pool-images upload" ON storage.objects;
CREATE POLICY "dex-pool-images upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'dex-pool-images');

ALTER PUBLICATION supabase_realtime ADD TABLE public.dex_pool_orders, public.dex_pool_trades;
