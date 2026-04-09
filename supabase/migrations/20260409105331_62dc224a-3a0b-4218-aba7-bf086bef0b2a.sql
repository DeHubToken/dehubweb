
-- fraction_listings: seller lists fractions at a fixed price
CREATE TABLE public.fraction_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  seller_address TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  filled_quantity INTEGER NOT NULL DEFAULT 0,
  price_per_fraction NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fraction_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fraction listings" ON public.fraction_listings FOR SELECT USING (true);
CREATE POLICY "Sellers can create their own listings" ON public.fraction_listings FOR INSERT WITH CHECK (lower(seller_address) = get_request_wallet_address());
CREATE POLICY "Sellers can update their own listings" ON public.fraction_listings FOR UPDATE USING (lower(seller_address) = get_request_wallet_address());
CREATE POLICY "Sellers can delete their own listings" ON public.fraction_listings FOR DELETE USING (lower(seller_address) = get_request_wallet_address());

CREATE INDEX idx_fraction_listings_token ON public.fraction_listings (token_id, status);
CREATE INDEX idx_fraction_listings_seller ON public.fraction_listings (lower(seller_address));

CREATE TRIGGER update_fraction_listings_updated_at
BEFORE UPDATE ON public.fraction_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fraction_offers: buyer makes an offer
CREATE TABLE public.fraction_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  buyer_address TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_fraction NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  target_seller TEXT,
  listing_id UUID REFERENCES public.fraction_listings(id) ON DELETE SET NULL,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fraction_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fraction offers" ON public.fraction_offers FOR SELECT USING (true);
CREATE POLICY "Buyers can create their own offers" ON public.fraction_offers FOR INSERT WITH CHECK (lower(buyer_address) = get_request_wallet_address());
CREATE POLICY "Participants can update offers" ON public.fraction_offers FOR UPDATE USING (true);
CREATE POLICY "Buyers can delete their own offers" ON public.fraction_offers FOR DELETE USING (lower(buyer_address) = get_request_wallet_address());

CREATE INDEX idx_fraction_offers_token ON public.fraction_offers (token_id, status);
CREATE INDEX idx_fraction_offers_buyer ON public.fraction_offers (lower(buyer_address));

CREATE TRIGGER update_fraction_offers_updated_at
BEFORE UPDATE ON public.fraction_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fraction_trades: completed trade log
CREATE TABLE public.fraction_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  seller_address TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_fraction NUMERIC NOT NULL,
  total_dhb NUMERIC NOT NULL,
  tx_hash TEXT,
  listing_id UUID REFERENCES public.fraction_listings(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES public.fraction_offers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fraction_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view fraction trades" ON public.fraction_trades FOR SELECT USING (true);
CREATE POLICY "Anyone can record fraction trades" ON public.fraction_trades FOR INSERT WITH CHECK (true);

CREATE INDEX idx_fraction_trades_token ON public.fraction_trades (token_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.fraction_listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fraction_offers;

-- Notification trigger: notify holder when someone makes an offer on their fractions
CREATE OR REPLACE FUNCTION public.notify_fraction_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_seller IS NOT NULL THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.target_seller, NEW.buyer_address, 'fraction_offer',
      'Made an offer of ' || NEW.price_per_fraction || ' DHB/fraction for ' || NEW.quantity || ' fractions',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_fraction_offer_created
AFTER INSERT ON public.fraction_offers
FOR EACH ROW EXECUTE FUNCTION public.notify_fraction_offer();

-- Notification trigger: notify buyer when their offer status changes
CREATE OR REPLACE FUNCTION public.notify_fraction_offer_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected') THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.buyer_address,
      COALESCE(NEW.target_seller, ''),
      'fraction_offer_' || NEW.status,
      'Your offer on Post #' || NEW.token_id || ' was ' || NEW.status,
      NEW.token_id,
      'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_fraction_offer_status_change
AFTER UPDATE ON public.fraction_offers
FOR EACH ROW EXECUTE FUNCTION public.notify_fraction_offer_status();
