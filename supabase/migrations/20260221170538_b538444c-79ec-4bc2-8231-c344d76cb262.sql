
-- Create ppv_purchases table
CREATE TABLE public.ppv_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'DHB',
  chain_id INTEGER NOT NULL DEFAULT 8453,
  tx_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(token_id, buyer_address)
);

-- Enable RLS
ALTER TABLE public.ppv_purchases ENABLE ROW LEVEL SECURITY;

-- Anyone can read (for purchase counts)
CREATE POLICY "Anyone can view ppv purchases"
ON public.ppv_purchases
FOR SELECT
USING (true);

-- Only the buyer can insert their own purchase
CREATE POLICY "Buyers can record their own purchases"
ON public.ppv_purchases
FOR INSERT
WITH CHECK (lower(buyer_address) = get_request_wallet_address());
