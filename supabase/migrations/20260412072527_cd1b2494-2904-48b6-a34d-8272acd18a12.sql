
CREATE TABLE public.saved_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Home',
  full_name TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own addresses"
ON public.saved_addresses FOR SELECT
USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can create own addresses"
ON public.saved_addresses FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update own addresses"
ON public.saved_addresses FOR UPDATE
USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete own addresses"
ON public.saved_addresses FOR DELETE
USING (lower(wallet_address) = get_request_wallet_address());

CREATE TRIGGER update_saved_addresses_updated_at
BEFORE UPDATE ON public.saved_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
