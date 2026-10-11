CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret(id integer PRIMARY KEY, key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES(1,convert_to('affiliate-test-fixture-only','UTF8'));
-- Tests exercise actual session verification with an isolated fixture key.
CREATE FUNCTION public.test_wallet(wallet text, expires bigint DEFAULT extract(epoch FROM now())::bigint+3600)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE payload text := wallet||'.'||expires; signature text;
BEGIN
  SELECT encode(extensions.hmac(convert_to(payload,'UTF8'),key,'sha256'),'hex') INTO signature FROM wallet_auth.secret WHERE id=1;
  PERFORM set_config('request.headers',jsonb_build_object('x-wallet-address',wallet,'x-wallet-session',payload||'.'||signature)::text,true);
END;
$$;
CREATE TABLE public.affiliate_codes(code text PRIMARY KEY, owner_address text NOT NULL, active boolean NOT NULL DEFAULT true, commission_pct int DEFAULT 20);
CREATE TABLE public.affiliate_referrals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,owner_address text NOT NULL,referred_address text NOT NULL UNIQUE,l2_owner_address text,source text,created_at timestamptz DEFAULT now());
GRANT SELECT ON public.affiliate_referrals TO anon,authenticated;
