-- Replacement never needs the old signing key. All archived material remains
-- encrypted under its original protection; only the owner can read it.
CREATE TABLE public.user_wallet_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eth_address text NOT NULL,
  replacement_address text NOT NULL,
  wallet_record jsonb NOT NULL,
  recovery_record jsonb,
  passkey_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  backup_record jsonb,
  profile_rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, eth_address, replacement_address)
);

ALTER TABLE public.user_wallet_archives ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_wallet_archives TO authenticated;
GRANT ALL ON public.user_wallet_archives TO service_role;
CREATE POLICY "Users read their archived wallets" ON public.user_wallet_archives
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.replace_user_wallet(
  p_expected_address text,
  p_new_address text,
  p_encrypted_seed text,
  p_salt text,
  p_iv text,
  p_kdf_iterations integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  caller uuid := auth.uid();
  previous public.user_wallets%ROWTYPE;
  recovery jsonb;
  passkeys jsonb;
  backup jsonb;
  retry boolean := false;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in before replacing your wallet' USING ERRCODE = '42501';
  END IF;
  IF p_expected_address IS NULL OR p_new_address IS NULL
     OR p_expected_address !~ '^0x[0-9a-fA-F]{40}$'
     OR p_new_address !~ '^0x[0-9a-fA-F]{40}$'
     OR lower(p_new_address) = '0x0000000000000000000000000000000000000000'
     OR lower(p_expected_address) = lower(p_new_address)
     OR coalesce(p_encrypted_seed, '') = '' OR coalesce(p_salt, '') = ''
     OR coalesce(p_iv, '') = '' OR p_kdf_iterations IS NULL OR p_kdf_iterations < 0 THEN
    RAISE EXCEPTION 'Invalid wallet replacement' USING ERRCODE = '22023';
  END IF;

  -- Serializes competing replacements for this identity. An outdated device
  -- cannot replace a wallet that has changed since its confirmation screen.
  SELECT * INTO previous FROM public.user_wallets WHERE user_id = caller FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existing wallet to replace' USING ERRCODE = 'P0002';
  END IF;
  IF lower(previous.eth_address) = lower(p_new_address) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_wallet_archives
      WHERE user_id = caller AND eth_address = lower(p_expected_address)
        AND replacement_address = lower(p_new_address)
    ) INTO retry;
  END IF;
  IF NOT retry AND lower(previous.eth_address) <> lower(p_expected_address) THEN
    RAISE EXCEPTION 'Your wallet changed. Sign in again before replacing it.' USING ERRCODE = '40001';
  END IF;

  IF NOT retry THEN
    SELECT to_jsonb(r) INTO recovery FROM public.user_wallet_recovery r WHERE user_id = caller;
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at, p.id), '[]'::jsonb)
      INTO passkeys FROM public.user_wallet_passkeys p WHERE user_id = caller;
    IF to_regclass('public.wallet_backup_status') IS NOT NULL THEN
      EXECUTE 'SELECT to_jsonb(b) FROM public.wallet_backup_status b WHERE user_id = $1'
        INTO backup USING caller;
    END IF;

    INSERT INTO public.user_wallet_archives
      (user_id, eth_address, replacement_address, wallet_record, recovery_record, passkey_records, backup_record)
    VALUES (caller, lower(previous.eth_address), lower(p_new_address), to_jsonb(previous), recovery, passkeys, backup);

    -- Old wraps must not unlock the new wallet. Their ciphertext is already
    -- in the archive and remains available if the original credentials return.
    DELETE FROM public.user_wallet_recovery WHERE user_id = caller;
    DELETE FROM public.user_wallet_passkeys WHERE user_id = caller;
    IF to_regclass('public.wallet_backup_status') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.wallet_backup_status WHERE user_id = $1' USING caller;
    END IF;
  END IF;

  -- Retries can re-protect the same new seed, without clearing wraps or backup
  -- status enrolled after the first successful replacement.
  UPDATE public.user_wallets SET
    eth_address = p_new_address, encrypted_seed = p_encrypted_seed,
    salt = p_salt, iv = p_iv, kdf_iterations = p_kdf_iterations
  WHERE user_id = caller RETURNING * INTO previous;
  RETURN to_jsonb(previous);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_wallet(text,text,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_user_wallet(text,text,text,text,text,integer) TO authenticated;

-- A pending archive is also a durable retry marker after a browser/phone
-- closes between saving the new wallet and rotating the profile.
CREATE FUNCTION public.complete_wallet_replacement(p_new_address text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_wallets WHERE user_id = auth.uid()
      AND lower(eth_address) = lower(p_new_address)
  ) THEN
    RAISE EXCEPTION 'Active wallet does not match replacement' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_wallet_archives SET profile_rotated_at = now()
  WHERE user_id = auth.uid() AND replacement_address = lower(p_new_address)
    AND profile_rotated_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_wallet_replacement(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_wallet_replacement(text) TO authenticated;
