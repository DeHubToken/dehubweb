CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret (id integer PRIMARY KEY, key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES (1, convert_to('fixture-only', 'UTF8'));
CREATE TABLE public.user_display_preferences (
  wallet_address text PRIMARY KEY,
  shorts_enabled boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{}',
  reaction_tip_seen boolean NOT NULL DEFAULT false
);
ALTER TABLE public.user_display_preferences ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;

-- Fixture session issuer. Production clients cannot set these signed headers
-- without the existing wallet-session service proving their identity.
CREATE FUNCTION public.test_dub_session(wallet text, signed boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  expiry text := (extract(epoch FROM now())::bigint + 3600)::text;
  signature text;
BEGIN
  signature := encode(extensions.hmac(convert_to(wallet || '.' || expiry, 'UTF8'), convert_to('fixture-only', 'UTF8'), 'sha256'), 'hex');
  PERFORM set_config('dehub.signed_wallet', '', true);
  PERFORM set_config('request.headers', json_build_object(
    'x-wallet-address', '0x9999999999999999999999999999999999999999',
    'x-wallet-session', CASE WHEN signed THEN wallet || '.' || expiry || '.' || signature ELSE NULL END
  )::text, true);
END;
$$;
