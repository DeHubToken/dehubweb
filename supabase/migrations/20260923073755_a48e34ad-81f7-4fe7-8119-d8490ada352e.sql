CREATE TABLE IF NOT EXISTS public.dex_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('base', 'ethereum', 'robinhood', 'solana')),
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

GRANT SELECT ON public.dex_pools TO anon, authenticated;
GRANT ALL ON public.dex_pools TO service_role;

ALTER TABLE public.dex_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pools" ON public.dex_pools;
CREATE POLICY "Anyone can view DEX pools" ON public.dex_pools FOR SELECT USING (true);

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

GRANT SELECT, INSERT ON public.dex_pool_orders TO anon, authenticated;
GRANT ALL ON public.dex_pool_orders TO service_role;

ALTER TABLE public.dex_pool_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pool orders" ON public.dex_pool_orders;
CREATE POLICY "Anyone can view DEX pool orders" ON public.dex_pool_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners can index DEX pool orders" ON public.dex_pool_orders;
CREATE POLICY "Owners can index DEX pool orders" ON public.dex_pool_orders FOR INSERT
  WITH CHECK (owner_address = public.get_request_wallet_address());

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

GRANT SELECT, INSERT ON public.dex_pool_trades TO anon, authenticated;
GRANT ALL ON public.dex_pool_trades TO service_role;

ALTER TABLE public.dex_pool_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view DEX pool trades" ON public.dex_pool_trades;
CREATE POLICY "Anyone can view DEX pool trades" ON public.dex_pool_trades FOR SELECT USING (true);
DROP POLICY IF EXISTS "Traders can index DEX pool trades" ON public.dex_pool_trades;
CREATE POLICY "Traders can index DEX pool trades" ON public.dex_pool_trades FOR INSERT
  WITH CHECK (owner_address = public.get_request_wallet_address());

ALTER PUBLICATION supabase_realtime ADD TABLE public.dex_pool_orders, public.dex_pool_trades;