
CREATE TABLE public.tip_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_address text NOT NULL,
  receiver_address text NOT NULL,
  amount numeric NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  tx_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tip_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tips" ON public.tip_records FOR SELECT USING (true);

CREATE POLICY "Users can record sent tips" ON public.tip_records FOR INSERT
  WITH CHECK (lower(sender_address) = get_request_wallet_address());

CREATE INDEX idx_tip_records_sender ON public.tip_records (lower(sender_address));
CREATE INDEX idx_tip_records_receiver ON public.tip_records (lower(receiver_address));
CREATE INDEX idx_tip_records_created_at ON public.tip_records (created_at);
