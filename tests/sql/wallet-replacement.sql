-- Fixtures are ciphertext labels, never actual wallet secrets.
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.user_wallets (user_id,eth_address,encrypted_seed,salt,iv) VALUES
  ('11111111-1111-1111-1111-111111111111','0x1111111111111111111111111111111111111111','old-cipher','salt','iv'),
  ('22222222-2222-2222-2222-222222222222','0x2222222222222222222222222222222222222222',NULL,NULL,NULL);
INSERT INTO public.user_wallet_recovery (user_id,encrypted_seed,salt,iv) VALUES
  ('11111111-1111-1111-1111-111111111111','recovery-cipher','salt','iv');
INSERT INTO public.user_wallet_passkeys (user_id,credential_id,prf_salt,encrypted_seed,salt,iv) VALUES
  ('11111111-1111-1111-1111-111111111111','credential','prf-salt','passkey-cipher','salt','iv');
INSERT INTO public.wallet_backup_status VALUES
  ('11111111-1111-1111-1111-111111111111','0x1111111111111111111111111111111111111111',now());
ALTER TABLE public.user_wallets ADD CONSTRAINT simulated_save_failure CHECK (encrypted_seed <> 'reject-save');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.replace_user_wallet('0x1111111111111111111111111111111111111111','0x3333333333333333333333333333333333333333',NULL,'salt','iv',0);
    RAISE EXCEPTION 'invalid payload accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT encrypted_seed FROM public.user_wallets) <> 'old-cipher' THEN RAISE EXCEPTION 'invalid replacement changed wallet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_wallet_recovery) OR NOT EXISTS (SELECT 1 FROM public.user_wallet_passkeys) THEN RAISE EXCEPTION 'invalid replacement removed backups'; END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM public.replace_user_wallet('0x1111111111111111111111111111111111111111','0x3333333333333333333333333333333333333333','reject-save','salt','iv',0);
    RAISE EXCEPTION 'simulated failed save succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.user_wallet_archives) THEN RAISE EXCEPTION 'failed save left a partial archive'; END IF;
  IF (SELECT encrypted_seed FROM public.user_wallets) <> 'old-cipher' THEN RAISE EXCEPTION 'failed save changed active wallet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_wallet_recovery) OR NOT EXISTS (SELECT 1 FROM public.user_wallet_passkeys) THEN RAISE EXCEPTION 'failed save lost backups'; END IF;
END $$;

SELECT public.replace_user_wallet('0x1111111111111111111111111111111111111111','0x3333333333333333333333333333333333333333','new-cipher','salt','iv',0);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_wallet_archives) <> 1 THEN RAISE EXCEPTION 'missing archive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_wallet_archives
    WHERE wallet_record->>'encrypted_seed' = 'old-cipher'
      AND recovery_record->>'encrypted_seed' = 'recovery-cipher'
      AND passkey_records->0->>'encrypted_seed' = 'passkey-cipher'
      AND passkey_records->0->>'prf_salt' = 'prf-salt'
      AND backup_record->>'eth_address' = '0x1111111111111111111111111111111111111111') THEN RAISE EXCEPTION 'archive lost encryption or backup metadata'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_wallet_recovery) OR EXISTS (SELECT 1 FROM public.user_wallet_passkeys) THEN RAISE EXCEPTION 'old wraps still active'; END IF;
  BEGIN
    DELETE FROM public.user_wallet_archives;
    RAISE EXCEPTION 'archive deletion permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.replace_user_wallet('0x1111111111111111111111111111111111111111','0x4444444444444444444444444444444444444444','wrong','salt','iv',0);
    RAISE EXCEPTION 'stale screen replaced the new wallet';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;

-- Simulate a lost response, followed by enrollment of a new recovery wrap.
INSERT INTO public.user_wallet_recovery (user_id,encrypted_seed,salt,iv) VALUES
  ('11111111-1111-1111-1111-111111111111','new-recovery','salt','iv');
SELECT public.replace_user_wallet('0x1111111111111111111111111111111111111111','0x3333333333333333333333333333333333333333','retry-cipher','salt','iv',0);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_wallet_archives) <> 1 THEN RAISE EXCEPTION 'retry duplicated archive'; END IF;
  IF (SELECT encrypted_seed FROM public.user_wallets) <> 'retry-cipher' THEN RAISE EXCEPTION 'retry did not re-protect same wallet'; END IF;
  IF (SELECT encrypted_seed FROM public.user_wallet_recovery) <> 'new-recovery' THEN RAISE EXCEPTION 'retry cleared new recovery'; END IF;
END $$;
SELECT public.complete_wallet_replacement('0x3333333333333333333333333333333333333333');
SELECT public.complete_wallet_replacement('0x3333333333333333333333333333333333333333');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.user_wallet_archives WHERE profile_rotated_at IS NULL) THEN RAISE EXCEPTION 'completed rotation remains pending'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.user_wallet_archives) THEN RAISE EXCEPTION 'archive exposed to another user'; END IF;
  BEGIN
    PERFORM public.complete_wallet_replacement('0x3333333333333333333333333333333333333333');
    RAISE EXCEPTION 'another identity completed the replacement';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.replace_user_wallet('0x2222222222222222222222222222222222222222','0x5555555555555555555555555555555555555555','device-cipher','salt','iv',0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_wallet_archives WHERE wallet_record->>'eth_address' = '0x2222222222222222222222222222222222222222') THEN RAISE EXCEPTION 'passwordless old wallet could not be archived'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.replace_user_wallet('0x2222222222222222222222222222222222222222','0x6666666666666666666666666666666666666666','cipher','salt','iv',0);
    RAISE EXCEPTION 'unauthenticated replacement accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
