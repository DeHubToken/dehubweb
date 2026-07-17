
ALTER TABLE public.affiliate_earnings
  ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 1;

ALTER TABLE public.affiliate_earnings
  DROP CONSTRAINT IF EXISTS affiliate_earnings_tier_check;
ALTER TABLE public.affiliate_earnings
  ADD CONSTRAINT affiliate_earnings_tier_check CHECK (tier IN (1,2));

CREATE INDEX IF NOT EXISTS affiliate_earnings_owner_tier_idx
  ON public.affiliate_earnings (owner_address, tier);

ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS l2_owner_address text;

CREATE INDEX IF NOT EXISTS affiliate_referrals_l2_owner_idx
  ON public.affiliate_referrals (l2_owner_address);

-- Backfill l2_owner_address: the L1 of the current owner (if any)
UPDATE public.affiliate_referrals r
SET l2_owner_address = parent.owner_address
FROM public.affiliate_referrals parent
WHERE r.l2_owner_address IS NULL
  AND lower(parent.referred_address) = lower(r.owner_address);
