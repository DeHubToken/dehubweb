-- Buy Bot State: tracks the last processed block to avoid duplicate alerts
CREATE TABLE IF NOT EXISTS public.buy_bot_state (
  id TEXT PRIMARY KEY DEFAULT 'dhb',
  last_block_number BIGINT NOT NULL DEFAULT 0,
  last_tx_hashes TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed the initial row
INSERT INTO public.buy_bot_state (id, last_block_number, last_tx_hashes)
VALUES ('dhb', 0, '{}')
ON CONFLICT (id) DO NOTHING;

-- Allow service role full access (bypasses RLS automatically, but being explicit)
ALTER TABLE public.buy_bot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage buy bot state"
  ON public.buy_bot_state
  USING (true)
  WITH CHECK (true);

-- Note: the edge function uses the service_role key which bypasses RLS entirely.
-- No extra policy needed for buy_alert inserts.
