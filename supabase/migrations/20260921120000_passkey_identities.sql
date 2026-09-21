-- Passkey-only sign-in.
--
-- A passkey can be the whole identity: no email, no phone, no OAuth account
-- behind it. The passkey-auth edge function verifies a WebAuthn registration
-- or assertion against the rows here and mints a Supabase session for the
-- user the credential belongs to (the same one-shot-password mint that
-- verify-phone-otp and telegram-auth use).
--
-- This is deliberately a different table from user_wallet_passkeys. That one
-- holds the wallet seed wrapped under a passkey's PRF output and is written
-- by the client under RLS; nothing in it is ever checked server-side. This
-- table holds the credential's PUBLIC KEY and signature counter, which only
-- the server may read or write — a client that could edit its own row could
-- register any key it liked and sign in as itself without the authenticator.
-- The same physical passkey usually appears in both tables: here as the
-- identity, there as the wallet wrap, so one fingerprint does both jobs.

CREATE TABLE IF NOT EXISTS public.passkey_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- base64url of the raw WebAuthn credential id. Globally unique by
  -- construction (the authenticator generates it), so it is the lookup key
  -- at sign-in time, before the user is known.
  credential_id TEXT NOT NULL UNIQUE,
  -- base64url COSE public key, exactly as the registration response carried it.
  public_key TEXT NOT NULL,
  -- Signature counter. Synced passkeys report 0 forever; hardware ones climb.
  counter BIGINT NOT NULL DEFAULT 0,
  -- The WebAuthn user handle this credential was created under.
  user_handle TEXT NOT NULL,
  -- Which relying party id the credential is bound to (dehub.io, a preview
  -- host, localhost). A credential only ever answers for its own rp id.
  rp_id TEXT NOT NULL,
  transports TEXT[],
  backed_up BOOLEAN,
  aaguid TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS passkey_identities_user_id_idx
  ON public.passkey_identities (user_id);

-- Server only. No client role gets any grant; RLS is on with no policies so a
-- misconfigured grant elsewhere still exposes nothing.
REVOKE ALL ON public.passkey_identities FROM PUBLIC;
REVOKE ALL ON public.passkey_identities FROM anon, authenticated;
GRANT ALL ON public.passkey_identities TO service_role;
ALTER TABLE public.passkey_identities ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.passkey_identities IS
  'WebAuthn credentials that ARE a login identity. Read and written only by the passkey-auth edge function via the service role.';

-- One-time challenges. A row is inserted when options are issued and deleted
-- when the response is verified, so a captured response cannot be replayed —
-- a synced passkey's counter never moves, which makes single-use challenges
-- the only replay defence that works for every authenticator.
CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  rp_id TEXT NOT NULL,
  -- Set for a registration that adds a credential to an already signed-in
  -- account, so the verify step attaches to that user and no other.
  user_id UUID,
  user_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS passkey_challenges_expires_at_idx
  ON public.passkey_challenges (expires_at);

REVOKE ALL ON public.passkey_challenges FROM PUBLIC;
REVOKE ALL ON public.passkey_challenges FROM anon, authenticated;
GRANT ALL ON public.passkey_challenges TO service_role;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.passkey_challenges IS
  'Single-use WebAuthn challenges for passkey-auth. Expired rows are swept opportunistically by the function.';
