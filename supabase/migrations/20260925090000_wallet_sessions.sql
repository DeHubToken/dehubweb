-- Signed wallet sessions for row-level security.
--
-- get_request_wallet_address() used to return whatever the caller put in the
-- x-wallet-address header, so anyone who knew a wallet could read and write as
-- it. Clients now also send x-wallet-session: "<wallet>.<expiry>.<hmac>",
-- minted by the wallet-session edge function after it verifies the DeHub
-- token. The key never leaves the database.
--
-- Rollout is in two steps so no client breaks:
--   1. (this migration) a valid session wins; a request without one still
--      falls back to the bare header, exactly as before.
--   2. once every active wallet is minting sessions, set
--      wallet_auth.config.enforce = true and the header alone stops counting.
--      Setting it back to false undoes that instantly.

CREATE SCHEMA IF NOT EXISTS wallet_auth;
REVOKE ALL ON SCHEMA wallet_auth FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS wallet_auth.secret (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  key bytea NOT NULL
);
INSERT INTO wallet_auth.secret (id, key)
VALUES (1, extensions.gen_random_bytes(32))
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wallet_auth.config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enforce boolean NOT NULL DEFAULT false
);
INSERT INTO wallet_auth.config (id, enforce) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- Who has minted a session, from which client and build. Read before step 2:
-- every wallet active recently should appear here with a recent last_at.
CREATE TABLE IF NOT EXISTS wallet_auth.mints (
  wallet text PRIMARY KEY,
  client text,
  app_version text,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.issue_wallet_session(
  p_wallet text,
  p_ttl_seconds int DEFAULT 43200,
  p_client text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  w text := lower(trim(p_wallet));
  exp bigint := extract(epoch FROM now())::bigint + least(greatest(coalesce(p_ttl_seconds, 43200), 60), 86400);
  k bytea;
BEGIN
  IF w !~ '^0x[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'invalid wallet';
  END IF;
  SELECT s.key INTO k FROM wallet_auth.secret s WHERE s.id = 1;
  token := w || '.' || exp || '.' || encode(extensions.hmac(w || '.' || exp, k, 'sha256'), 'hex');
  expires_at := to_timestamp(exp);
  INSERT INTO wallet_auth.mints AS m (wallet, client, app_version)
  VALUES (w, left(p_client, 20), left(p_app_version, 40))
  ON CONFLICT (wallet) DO UPDATE
    SET last_at = now(), count = m.count + 1,
        client = coalesce(excluded.client, m.client),
        app_version = coalesce(excluded.app_version, m.app_version);
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.issue_wallet_session(text, int, text, text) FROM PUBLIC, anon, authenticated;

-- The one function every wallet-scoped policy calls. Cached per transaction
-- (each API request is one), so a policy evaluated per row verifies the
-- signature once.
CREATE OR REPLACE FUNCTION public.get_request_wallet_address()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cached text := current_setting('dehub.request_wallet', true);
  headers json;
  sess text;
  parts text[];
  w text := '';
  k bytea;
  must_sign boolean;
BEGIN
  IF cached LIKE 'v:%' THEN
    RETURN substr(cached, 3);
  END IF;

  headers := nullif(current_setting('request.headers', true), '')::json;
  sess := headers ->> 'x-wallet-session';

  IF sess IS NOT NULL THEN
    parts := string_to_array(sess, '.');
    IF array_length(parts, 1) = 3
       AND parts[1] ~ '^0x[a-f0-9]{40}$'
       AND parts[2] ~ '^[0-9]{1,12}$'
       AND parts[2]::bigint > extract(epoch FROM now()) THEN
      SELECT s.key INTO k FROM wallet_auth.secret s WHERE s.id = 1;
      IF encode(extensions.hmac(parts[1] || '.' || parts[2], k, 'sha256'), 'hex') = parts[3] THEN
        w := parts[1];
      END IF;
    END IF;
  END IF;

  IF w = '' THEN
    SELECT c.enforce INTO must_sign FROM wallet_auth.config c WHERE c.id = 1;
    IF NOT coalesce(must_sign, false) THEN
      w := lower(coalesce(headers ->> 'x-wallet-address', ''));
    END IF;
  END IF;

  PERFORM set_config('dehub.request_wallet', 'v:' || w, true);
  RETURN w;
END;
$$;
