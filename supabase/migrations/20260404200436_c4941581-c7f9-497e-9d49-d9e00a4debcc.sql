ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS ticker_contract_address text,
  ADD COLUMN IF NOT EXISTS ticker_chain_id text,
  ADD COLUMN IF NOT EXISTS ticker_pair_address text;