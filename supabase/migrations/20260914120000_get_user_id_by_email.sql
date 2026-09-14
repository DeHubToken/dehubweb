-- ============================================================================
-- Look up an auth user by email, for edge functions running as service_role
-- ============================================================================
-- The sibling of get_user_id_by_phone (20260808090000_phone_otp_codes.sql),
-- added for telegram-auth. A login provider that Supabase does not support
-- natively has to find-or-create its own auth user, and the admin API has no
-- "get user by email" — only listUsers(), which pages through the whole table.
--
-- Kept to the same shape as the phone one deliberately: SQL, STABLE, SECURITY
-- DEFINER with a pinned search_path, revoked from PUBLIC and granted only to
-- service_role. A client holding the anon key cannot call it, so it is not a
-- way to test whether an address has an account.

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
