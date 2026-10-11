CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
-- The production identity resolver verifies a signed wallet session. This
-- fixture supplies its verified output without a signing secret.
CREATE FUNCTION public.get_request_wallet_address() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.wallet', true), '');
$$;
CREATE TABLE public.affiliate_codes(code text PRIMARY KEY, owner_address text NOT NULL, active boolean NOT NULL DEFAULT true, commission_pct int DEFAULT 20);
CREATE TABLE public.affiliate_referrals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,owner_address text NOT NULL,referred_address text NOT NULL UNIQUE,l2_owner_address text,source text,created_at timestamptz DEFAULT now());
GRANT SELECT ON public.affiliate_referrals TO anon,authenticated;
