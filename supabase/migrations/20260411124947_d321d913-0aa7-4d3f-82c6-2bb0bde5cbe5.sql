
-- Create store_reviews table
CREATE TABLE public.store_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  reviewer_address TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  seller_response TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(listing_id, reviewer_address)
);

-- Enable RLS
ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews
CREATE POLICY "Anyone can view store reviews"
ON public.store_reviews FOR SELECT
USING (true);

-- Only buyers who have an order for this listing can create a review
CREATE POLICY "Buyers can review purchased listings"
ON public.store_reviews FOR INSERT
WITH CHECK (
  lower(reviewer_address) = get_request_wallet_address()
  AND EXISTS (
    SELECT 1 FROM public.store_orders
    WHERE store_orders.listing_id = store_reviews.listing_id
    AND lower(store_orders.buyer_address) = get_request_wallet_address()
  )
);

-- Reviewers can update their own review
CREATE POLICY "Reviewers can update own reviews"
ON public.store_reviews FOR UPDATE
USING (lower(reviewer_address) = get_request_wallet_address());

-- Sellers can update seller_response on their listing reviews
CREATE POLICY "Sellers can respond to reviews"
ON public.store_reviews FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.store_listings
    WHERE store_listings.id = store_reviews.listing_id
    AND lower(store_listings.wallet_address) = get_request_wallet_address()
  )
);

-- Reviewers can delete their own review
CREATE POLICY "Reviewers can delete own reviews"
ON public.store_reviews FOR DELETE
USING (lower(reviewer_address) = get_request_wallet_address());

-- Trigger for updated_at
CREATE TRIGGER update_store_reviews_updated_at
BEFORE UPDATE ON public.store_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookup by listing
CREATE INDEX idx_store_reviews_listing ON public.store_reviews(listing_id);

-- Enable realtime for reviews
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_reviews;
