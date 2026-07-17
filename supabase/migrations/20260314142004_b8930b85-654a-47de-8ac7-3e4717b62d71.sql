
CREATE TABLE public.staking_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('BNB', 'Base')),
  tx_hash TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'stake' CHECK (action IN ('stake', 'unstake')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staking_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read staking records"
  ON public.staking_records FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert staking records"
  ON public.staking_records FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_staking_records_wallet ON public.staking_records(wallet_address);
