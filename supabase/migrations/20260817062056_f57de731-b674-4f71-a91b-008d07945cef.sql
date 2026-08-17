CREATE TABLE public.stream_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  listing_id UUID NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  creator_address TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMP WITH TIME ZONE,
  live_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (token_id, listing_id)
);

CREATE INDEX idx_stream_products_token ON public.stream_products(token_id);
CREATE INDEX idx_stream_products_listing ON public.stream_products(listing_id);

CREATE UNIQUE INDEX idx_stream_products_one_pin
  ON public.stream_products(token_id) WHERE is_pinned;

ALTER TABLE public.stream_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stream products"
ON public.stream_products FOR SELECT USING (true);

CREATE TRIGGER update_stream_products_updated_at
BEFORE UPDATE ON public.stream_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_products;
ALTER TABLE public.stream_products REPLICA IDENTITY FULL;

ALTER TABLE public.store_orders
  ADD COLUMN stream_token_id TEXT,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'store',
  ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN verify_error TEXT,
  ADD COLUMN paid_token_amount NUMERIC,
  ADD COLUMN paid_token_symbol TEXT;

CREATE INDEX idx_store_orders_stream ON public.store_orders(stream_token_id)
  WHERE stream_token_id IS NOT NULL;

CREATE UNIQUE INDEX idx_store_orders_tx_hash
  ON public.store_orders(lower(tx_hash)) WHERE tx_hash IS NOT NULL;

COMMENT ON COLUMN public.store_orders.status IS
  'pending_verification | paid | shipped | delivered | cancelled | rejected';

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

  IF NOT FOUND THEN
    SELECT stock_quantity INTO remaining
      FROM public.store_listings WHERE id = p_listing_id;
    IF remaining IS NULL THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'out_of_stock';
  END IF;

  IF remaining = 0 THEN
    UPDATE public.store_listings SET status = 'sold_out' WHERE id = p_listing_id;
  END IF;

  RETURN remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_listing_stock(UUID) FROM PUBLIC, anon, authenticated;