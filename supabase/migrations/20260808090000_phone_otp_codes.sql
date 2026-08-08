-- ============================================================================
-- Custom phone-OTP storage (bypasses Supabase's native Phone + Send SMS Hook)
-- ============================================================================
-- The native flow needs Authentication -> Hooks -> Send SMS enabled in the
-- Supabase dashboard to route OTP delivery through CloudTalk, and that toggle
-- is not reachable from this project's management surface. request-phone-otp
-- and verify-phone-otp implement the same job directly: generate a code, send
-- it via CloudTalk, verify it, then sign the user in with a one-time random
-- password (see verify-phone-otp) so the rest of the app still gets a normal
-- Supabase session.
--
-- Only ever touched by those two edge functions under the service role — RLS
-- is enabled with no policies, and both the table and the functions are
-- revoked from anon/authenticated, so a client holding only the anon key has
-- no path to this table at all, direct or through PostgREST.

CREATE TABLE IF NOT EXISTS public.phone_otp_codes (
  phone text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_otp_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_otp_codes FROM anon, authenticated;

COMMENT ON TABLE public.phone_otp_codes IS
  'One pending OTP per phone for the CloudTalk-backed custom phone-login flow. code_hash is SHA-256 of the code; the plaintext code is never persisted.';

-- Store a freshly generated OTP for a phone, replacing any prior pending code
-- and resetting the attempt counter. The per-phone/per-IP resend cooldown is
-- enforced by the edge function via _shared/auth.ts's existing rate limiter
-- before this is called.
CREATE OR REPLACE FUNCTION public.upsert_phone_otp(
  p_phone text,
  p_code_hash text,
  p_ttl_ms bigint
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.phone_otp_codes (phone, code_hash, expires_at, attempts, created_at)
  VALUES (p_phone, p_code_hash, now() + make_interval(secs => p_ttl_ms / 1000.0), 0, now())
  ON CONFLICT (phone) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        attempts = 0,
        created_at = now();
$$;

REVOKE ALL ON FUNCTION public.upsert_phone_otp(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_phone_otp(text, text, bigint) TO service_role;

-- Atomically verify and consume one attempt. The row lock from the SELECT ...
-- FOR UPDATE serializes concurrent verify calls for the same phone, so two
-- requests racing the same attempt budget can't both slip through the check
-- before either write lands (the exact class of bug fixed for
-- ai_agent_rate_limits in 20260806120000). A correct code deletes the row so
-- it can never be replayed.
CREATE OR REPLACE FUNCTION public.consume_phone_otp(
  p_phone text,
  p_code_hash text,
  p_max_attempts integer
)
RETURNS TABLE (valid boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.phone_otp_codes;
BEGIN
  SELECT * INTO v_row FROM public.phone_otp_codes WHERE phone = p_phone FOR UPDATE;

  IF v_row IS NULL THEN
    RETURN QUERY SELECT false, 'not_found';
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    DELETE FROM public.phone_otp_codes WHERE phone = p_phone;
    RETURN QUERY SELECT false, 'expired';
    RETURN;
  END IF;

  IF v_row.attempts >= p_max_attempts THEN
    RETURN QUERY SELECT false, 'too_many_attempts';
    RETURN;
  END IF;

  UPDATE public.phone_otp_codes SET attempts = attempts + 1 WHERE phone = p_phone;

  IF v_row.code_hash = p_code_hash THEN
    DELETE FROM public.phone_otp_codes WHERE phone = p_phone;
    RETURN QUERY SELECT true, 'ok';
  ELSE
    RETURN QUERY SELECT false, 'mismatch';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_phone_otp(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_phone_otp(text, text, integer) TO service_role;

-- auth.users isn't in PostgREST's exposed schemas, and the JS admin client has
-- no "find by phone" call — only paginated listUsers(). A SECURITY DEFINER
-- function reaching into auth directly is the straightforward way for
-- verify-phone-otp to tell "existing user, set a new password" apart from
-- "new phone, create the user".
CREATE OR REPLACE FUNCTION public.get_user_id_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE phone = p_phone LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_phone(text) TO service_role;
