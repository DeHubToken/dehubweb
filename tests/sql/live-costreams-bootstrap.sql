CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret(id integer PRIMARY KEY, key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES (1, convert_to('costream-fixture-only', 'UTF8'));
CREATE FUNCTION public.test_wallet(wallet text, expires bigint DEFAULT extract(epoch FROM now())::bigint + 3600)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE payload text := wallet || '.' || expires; signature text;
BEGIN
  SELECT encode(extensions.hmac(convert_to(payload, 'UTF8'), key, 'sha256'), 'hex') INTO signature FROM wallet_auth.secret WHERE id = 1;
  PERFORM set_config('request.headers', jsonb_build_object('x-wallet-address', wallet, 'x-wallet-session', payload || '.' || signature)::text, false);
  PERFORM set_config('dehub.signed_wallet', '', false);
END $$;
GRANT EXECUTE ON FUNCTION public.test_wallet(text, bigint) TO anon;
-- Copied from 20260929093849, unchanged apart from the session cache: each
-- statement in the test switches wallet, so the per-transaction cache is off.
CREATE OR REPLACE FUNCTION public.get_signed_request_wallet_address()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE headers json; sess text; parts text[]; w text := ''; k bytea;
BEGIN
  headers := nullif(current_setting('request.headers', true), '')::json;
  sess := headers ->> 'x-wallet-session';
  IF sess IS NOT NULL THEN
    parts := string_to_array(sess, '.');
    IF array_length(parts, 1) = 3 AND parts[1] ~ '^0x[a-f0-9]{40}$' AND parts[2] ~ '^[0-9]{1,12}$'
       AND parts[2]::bigint > extract(epoch FROM now()) THEN
      SELECT s.key INTO k FROM wallet_auth.secret s WHERE s.id = 1;
      IF encode(extensions.hmac(convert_to(parts[1] || '.' || parts[2], 'UTF8'), k, 'sha256'), 'hex') = parts[3] THEN
        w := parts[1];
      END IF;
    END IF;
  END IF;
  RETURN w;
END;
$function$;
