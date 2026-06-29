CREATE TABLE IF NOT EXISTS public.affiliate_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_address TEXT NOT NULL,
  share_name TEXT,
  commission_pct INTEGER NOT NULL DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_codes TO authenticated, anon;
GRANT ALL ON public.affiliate_codes TO service_role;
CREATE INDEX IF NOT EXISTS affiliate_codes_owner_idx ON public.affiliate_codes(lower(owner_address));
ALTER TABLE public.affiliate_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view affiliate codes"
  ON public.affiliate_codes FOR SELECT USING (true);
CREATE POLICY "Owner can create own code"
  ON public.affiliate_codes FOR INSERT
  WITH CHECK (lower(owner_address) = public.get_request_wallet_address());
CREATE POLICY "Owner can update own code"
  ON public.affiliate_codes FOR UPDATE
  USING (lower(owner_address) = public.get_request_wallet_address())
  WITH CHECK (lower(owner_address) = public.get_request_wallet_address());
CREATE POLICY "Owner can delete own code"
  ON public.affiliate_codes FOR DELETE
  USING (lower(owner_address) = public.get_request_wallet_address());

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  referred_address TEXT NOT NULL UNIQUE,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.affiliate_referrals TO authenticated, anon;
GRANT ALL ON public.affiliate_referrals TO service_role;
CREATE INDEX IF NOT EXISTS affiliate_referrals_owner_idx ON public.affiliate_referrals(lower(owner_address));
CREATE INDEX IF NOT EXISTS affiliate_referrals_code_idx ON public.affiliate_referrals(code);
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view referrals"
  ON public.affiliate_referrals FOR SELECT USING (true);
CREATE POLICY "Referred can self-attribute"
  ON public.affiliate_referrals FOR INSERT
  WITH CHECK (lower(referred_address) = public.get_request_wallet_address());

CREATE TABLE IF NOT EXISTS public.affiliate_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_address TEXT NOT NULL,
  referred_address TEXT NOT NULL,
  code TEXT,
  source TEXT NOT NULL,
  source_ref TEXT,
  gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  commission_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'earned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_earnings TO authenticated, anon;
GRANT ALL ON public.affiliate_earnings TO service_role;
CREATE INDEX IF NOT EXISTS affiliate_earnings_owner_idx ON public.affiliate_earnings(lower(owner_address));
ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their earnings"
  ON public.affiliate_earnings FOR SELECT
  USING (lower(owner_address) = public.get_request_wallet_address());