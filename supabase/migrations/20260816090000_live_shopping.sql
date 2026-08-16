-- ============================================================================
-- Live shopping: products attached to a live stream, and order provenance.
--
-- Commerce already lives here (stores / store_listings / store_orders); the
-- stream itself lives in Mongo behind api.dehub.io. This table is the join
-- between the two, keyed on token_id — the same key live_stream_sessions uses
-- and the only stream identifier both the web post page and the mobile viewer
-- hold at render time.
--
-- Writes are service-role only. get_request_wallet_address() reads an unsigned
-- client header, so a policy keyed on it could not stop a forger from pinning
-- products onto someone else's stream. The stream-products edge function
-- verifies the caller against /api/auth/verify and the token's minter instead.
-- ============================================================================

CREATE TABLE public.stream_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  listing_id UUID NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  creator_address TEXT NOT NULL,
  -- Display order in the viewer's rail. Ties break on created_at.
  position INTEGER NOT NULL DEFAULT 0,
  -- Exactly one product per stream may be "pinned" — the one the host is
  -- talking about right now, surfaced over the player. Enforced by a partial
  -- unique index below rather than by application code.
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMP WITH TIME ZONE,
  -- Live-only price override in USD. NULL means "use the listing's price".
  -- Kept here rather than mutating store_listings.price so the discount
  -- disappears with the stream instead of silently outliving it.
  live_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (token_id, listing_id)
);

CREATE INDEX idx_stream_products_token ON public.stream_products(token_id);
CREATE INDEX idx_stream_products_listing ON public.stream_products(listing_id);

-- One pinned product per stream.
CREATE UNIQUE INDEX idx_stream_products_one_pin
  ON public.stream_products(token_id) WHERE is_pinned;

ALTER TABLE public.stream_products ENABLE ROW LEVEL SECURITY;

-- Viewers must see the rail while signed out, so SELECT is open. There are
-- deliberately no INSERT/UPDATE/DELETE policies: every write goes through the
-- edge function under the service role.
CREATE POLICY "Anyone can view stream products"
ON public.stream_products FOR SELECT USING (true);

CREATE TRIGGER update_stream_products_updated_at
BEFORE UPDATE ON public.stream_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The rail is realtime: a host pinning a product has to land on every viewer
-- already watching, without a refetch.
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_products;
ALTER TABLE public.stream_products REPLICA IDENTITY FULL;

-- ============================================================================
-- Order provenance + payment verification
-- ============================================================================

-- Which stream an order came from, so a creator can see what a broadcast sold
-- and the viewer's order list can say where they bought it.
ALTER TABLE public.store_orders
  ADD COLUMN stream_token_id TEXT,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'store',
  -- Set by verify-store-order once the transfer has been read back off-chain.
  ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN verify_error TEXT,
  -- What the buyer was actually quoted, in DHB, at purchase time. `amount` is
  -- USD and drifts with the peg; this is the number that was signed for.
  ADD COLUMN paid_token_amount NUMERIC,
  ADD COLUMN paid_token_symbol TEXT;

CREATE INDEX idx_store_orders_stream ON public.store_orders(stream_token_id)
  WHERE stream_token_id IS NOT NULL;

-- One order per transaction. Without this the same hash can be replayed into
-- as many orders as the buyer likes — every one of them notifying the seller.
CREATE UNIQUE INDEX idx_store_orders_tx_hash
  ON public.store_orders(lower(tx_hash)) WHERE tx_hash IS NOT NULL;

-- Live orders start unverified and are promoted by the edge function. The
-- existing default ('paid') is left alone so the marketplace path is unchanged.
COMMENT ON COLUMN public.store_orders.status IS
  'pending_verification | paid | shipped | delivered | cancelled | rejected';

-- ============================================================================
-- Stock
--
-- Decrementing from the client means two concurrent buyers on a live drop both
-- read the same stock and both write stock-1. This does it in one statement,
-- and refuses to go below zero, so overselling is impossible regardless of how
-- many buyers hit Buy at the same instant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_listing_stock(p_listing_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE public.store_listings
     SET stock_quantity = stock_quantity - 1
   WHERE id = p_listing_id
     AND stock_quantity IS NOT NULL
     AND stock_quantity > 0
  RETURNING stock_quantity INTO remaining;

  -- NULL stock means unlimited: nothing to decrement, not a failure.
  IF NOT FOUND THEN
    SELECT stock_quantity INTO remaining
      FROM public.store_listings WHERE id = p_listing_id;
    IF remaining IS NULL THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'out_of_stock';
  END IF;

  -- Selling the last one takes the listing out of the browse grid and out of
  -- every stream rail pointing at it.
  IF remaining = 0 THEN
    UPDATE public.store_listings SET status = 'sold_out' WHERE id = p_listing_id;
  END IF;

  RETURN remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_listing_stock(UUID) FROM PUBLIC, anon, authenticated;
