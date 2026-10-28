CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret (id integer PRIMARY KEY, key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES (1, extensions.gen_random_bytes(32));
CREATE TABLE public.governance_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES public.governance_comments(id)
);
ALTER TABLE public.governance_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.governance_comments TO anon, authenticated;
-- The badge API is deterministic in this fixture; production retains its live
-- balance, lock and banned-account checks.
CREATE FUNCTION public.governance_has_comment_badge(wallet text, token text DEFAULT NULL)
RETURNS boolean LANGUAGE sql AS $$
  SELECT wallet = '0x0000000000000000000000000000000000000001';
$$;
