
-- =============================================
-- 1. STORES TABLE
-- =============================================
CREATE TABLE public.stores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  banner_url TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stores" ON public.stores FOR SELECT USING (true);
CREATE POLICY "Users can create their own store" ON public.stores FOR INSERT WITH CHECK (lower(wallet_address) = get_request_wallet_address());
CREATE POLICY "Users can update their own store" ON public.stores FOR UPDATE USING (lower(wallet_address) = get_request_wallet_address());
CREATE POLICY "Users can delete their own store" ON public.stores FOR DELETE USING (lower(wallet_address) = get_request_wallet_address());

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. STORE_LISTINGS TABLE
-- =============================================
CREATE TABLE public.store_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DHB',
  category TEXT NOT NULL DEFAULT 'other',
  images JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  stock_quantity INTEGER,
  is_digital BOOLEAN NOT NULL DEFAULT false,
  digital_file_url TEXT,
  condition TEXT DEFAULT 'new',
  shipping_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_listings_store_id ON public.store_listings(store_id);
CREATE INDEX idx_store_listings_wallet ON public.store_listings(wallet_address);
CREATE INDEX idx_store_listings_status ON public.store_listings(status);
CREATE INDEX idx_store_listings_category ON public.store_listings(category);

ALTER TABLE public.store_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active listings" ON public.store_listings FOR SELECT USING (true);
CREATE POLICY "Sellers can create their own listings" ON public.store_listings FOR INSERT WITH CHECK (lower(wallet_address) = get_request_wallet_address());
CREATE POLICY "Sellers can update their own listings" ON public.store_listings FOR UPDATE USING (lower(wallet_address) = get_request_wallet_address());
CREATE POLICY "Sellers can delete their own listings" ON public.store_listings FOR DELETE USING (lower(wallet_address) = get_request_wallet_address());

CREATE TRIGGER update_store_listings_updated_at BEFORE UPDATE ON public.store_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. STORE_ORDERS TABLE
-- =============================================
CREATE TABLE public.store_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  buyer_address TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  shipping_address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_orders_buyer ON public.store_orders(buyer_address);
CREATE INDEX idx_store_orders_seller ON public.store_orders(seller_address);
CREATE INDEX idx_store_orders_listing ON public.store_orders(listing_id);

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and sellers can view their orders" ON public.store_orders FOR SELECT USING (
  lower(buyer_address) = get_request_wallet_address() OR lower(seller_address) = get_request_wallet_address()
);
CREATE POLICY "Buyers can create orders" ON public.store_orders FOR INSERT WITH CHECK (lower(buyer_address) = get_request_wallet_address());
CREATE POLICY "Participants can update order status" ON public.store_orders FOR UPDATE USING (
  lower(buyer_address) = get_request_wallet_address() OR lower(seller_address) = get_request_wallet_address()
);

CREATE TRIGGER update_store_orders_updated_at BEFORE UPDATE ON public.store_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 4. NOTIFICATION TRIGGER FOR NEW ORDERS
-- =============================================
CREATE OR REPLACE FUNCTION public.notify_store_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT
    NEW.seller_address,
    NEW.buyer_address,
    'store_order',
    'purchased your listing',
    sl.id::text,
    sl.title
  FROM public.store_listings sl
  WHERE sl.id = NEW.listing_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_store_order_created
AFTER INSERT ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_store_order();

-- =============================================
-- 5. REALTIME ON STORE_ORDERS
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;

-- =============================================
-- 6. STORAGE BUCKET
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('store-media', 'store-media', true);

CREATE POLICY "Anyone can view store media" ON storage.objects FOR SELECT USING (bucket_id = 'store-media');
CREATE POLICY "Users can upload store media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'store-media');
CREATE POLICY "Users can update store media" ON storage.objects FOR UPDATE USING (bucket_id = 'store-media');
CREATE POLICY "Users can delete store media" ON storage.objects FOR DELETE USING (bucket_id = 'store-media');
