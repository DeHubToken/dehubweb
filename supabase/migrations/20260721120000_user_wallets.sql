-- Self-custody smart wallet storage (ported from the Pixcellor wallet system).
-- The seed is encrypted CLIENT-SIDE (AES-256-GCM, Argon2id KDF) before it is
-- stored here; these tables only ever hold ciphertext. RLS restricts every row
-- to its owner (Supabase Auth user).

CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  eth_address TEXT NOT NULL,
  encrypted_seed TEXT NOT NULL,
  salt TEXT NOT NULL,
  iv TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own wallet" ON public.user_wallets;
CREATE POLICY "Users select own wallet" ON public.user_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own wallet" ON public.user_wallets;
CREATE POLICY "Users insert own wallet" ON public.user_wallets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own wallet" ON public.user_wallets;
CREATE POLICY "Users update own wallet" ON public.user_wallets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own wallet" ON public.user_wallets;
CREATE POLICY "Users delete own wallet" ON public.user_wallets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Recovery record: the same seed encrypted under a 24-word recovery code, so a
-- forgotten wallet password can be reset without losing the wallet.
CREATE TABLE IF NOT EXISTS public.user_wallet_recovery (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_seed TEXT NOT NULL,
  salt TEXT NOT NULL,
  iv TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallet_recovery TO authenticated;
GRANT ALL ON public.user_wallet_recovery TO service_role;

ALTER TABLE public.user_wallet_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own wallet recovery" ON public.user_wallet_recovery;
CREATE POLICY "Users manage their own wallet recovery"
  ON public.user_wallet_recovery FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_user_wallets_updated_at ON public.user_wallets;
CREATE TRIGGER update_user_wallets_updated_at
  BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_wallet_updated_at();

DROP TRIGGER IF EXISTS user_wallet_recovery_updated_at ON public.user_wallet_recovery;
CREATE TRIGGER user_wallet_recovery_updated_at
  BEFORE UPDATE ON public.user_wallet_recovery
  FOR EACH ROW EXECUTE FUNCTION public.touch_wallet_updated_at();
