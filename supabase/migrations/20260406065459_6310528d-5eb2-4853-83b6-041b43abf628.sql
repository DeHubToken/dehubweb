
-- Add gate_fee column to community_events
ALTER TABLE public.community_events
ADD COLUMN gate_fee numeric NOT NULL DEFAULT 0;

-- Create event_gate_payments table
CREATE TABLE public.event_gate_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  payer_wallet_address text NOT NULL,
  creator_wallet_address text NOT NULL,
  amount numeric NOT NULL,
  tx_hash text NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_gate_payments ENABLE ROW LEVEL SECURITY;

-- Anyone can view payments (for verification)
CREATE POLICY "Anyone can view event gate payments"
ON public.event_gate_payments
FOR SELECT
USING (true);

-- Payers can record their own payment
CREATE POLICY "Payers can record their own payment"
ON public.event_gate_payments
FOR INSERT
WITH CHECK (lower(payer_wallet_address) = get_request_wallet_address());

-- Index for fast lookup
CREATE INDEX idx_event_gate_payments_event_payer
ON public.event_gate_payments (event_id, payer_wallet_address);
