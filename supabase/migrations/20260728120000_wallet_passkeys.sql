-- Biometric wallet unlock (WebAuthn PRF).
--
-- Each row holds the SAME seed as user_wallets.encrypted_seed, wrapped under a
-- key derived from one passkey's PRF output instead of the wallet password
-- (AES-256-GCM + HKDF-SHA256, all client-side — see src/lib/wallet-core).
-- The table only ever holds ciphertext plus the non-secret PRF salt; the PRF
-- output itself never leaves the user's device. One row per enrolled
-- credential, so removing a device revokes only that device.

CREATE TABLE IF NOT EXISTS public.user_wallet_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- base64url of the raw WebAuthn credential id
  credential_id TEXT NOT NULL,
  -- base64 PRF eval input. Not a secret: without the authenticator it is useless.
  prf_salt TEXT NOT NULL,
  encrypted_seed TEXT NOT NULL,
  salt TEXT NOT NULL,
  iv TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL DEFAULT 0,
  -- Best-effort device label ("iPhone") so users can tell entries apart.
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (user_id, credential_id)
);

CREATE INDEX IF NOT EXISTS user_wallet_passkeys_user_id_idx
  ON public.user_wallet_passkeys (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallet_passkeys TO authenticated;
GRANT ALL ON public.user_wallet_passkeys TO service_role;

ALTER TABLE public.user_wallet_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own wallet passkeys" ON public.user_wallet_passkeys;
CREATE POLICY "Users select own wallet passkeys" ON public.user_wallet_passkeys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own wallet passkeys" ON public.user_wallet_passkeys;
CREATE POLICY "Users insert own wallet passkeys" ON public.user_wallet_passkeys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own wallet passkeys" ON public.user_wallet_passkeys;
CREATE POLICY "Users update own wallet passkeys" ON public.user_wallet_passkeys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own wallet passkeys" ON public.user_wallet_passkeys;
CREATE POLICY "Users delete own wallet passkeys" ON public.user_wallet_passkeys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- A wallet created with biometrics has no password wrap, so the password
-- columns become optional. eth_address stays NOT NULL — it is the wallet's
-- identity and is always known. Existing rows are unaffected.
ALTER TABLE public.user_wallets ALTER COLUMN encrypted_seed DROP NOT NULL;
ALTER TABLE public.user_wallets ALTER COLUMN salt DROP NOT NULL;
ALTER TABLE public.user_wallets ALTER COLUMN iv DROP NOT NULL;

-- The three password columns are meaningful only together: a half-written wrap
-- would fail to decrypt with a corruption error rather than a clear message.
ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_password_wrap_complete;
ALTER TABLE public.user_wallets
  ADD CONSTRAINT user_wallets_password_wrap_complete CHECK (
    (encrypted_seed IS NULL AND salt IS NULL AND iv IS NULL)
    OR (encrypted_seed IS NOT NULL AND salt IS NOT NULL AND iv IS NOT NULL)
  );
