\ir community-holder-gate-bootstrap.sql
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS creator_wallet_address text;
