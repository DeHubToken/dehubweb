-- The board's owners move any request to Queued or Shipped from the page.
--
-- Until now a request's status only changed through the SQL editor. The
-- accounts listed in feature_request_status_editor_wallets() can now call
-- set_feature_request_status() for any request, whoever posted it:
--   in_progress  shows on the Queued tab
--   shipped      shows on the Shipped tab (the author's popup follows)
--   open         puts it back on Requests
--
-- Authors could still edit their own row's status straight through REST,
-- which would let anyone mark their own idea Shipped. A guard trigger now
-- refuses a status change from a plain client unless it comes from an editor.
-- Server code (service role, SQL editor, this function) is unaffected.
-- NOTE: git-pushed migrations don't reliably auto-apply; run against prod via SQL.

CREATE OR REPLACE FUNCTION public.feature_request_status_editor_wallets()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY[
    '0x9324840523a5d17dd12a2f11a9472e5a199c1937' -- maldoteth
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.is_feature_request_status_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lower(COALESCE(public.get_signed_request_wallet_address(), ''))
    = ANY (public.feature_request_status_editor_wallets());
$$;

CREATE OR REPLACE FUNCTION public.set_feature_request_status(p_id uuid, p_status text)
RETURNS public.feature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.feature_requests;
BEGIN
  IF NOT public.is_feature_request_status_editor() THEN
    RAISE EXCEPTION 'Only the board owners can change a request''s status'
      USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'in_progress', 'shipped') THEN
    RAISE EXCEPTION 'Unsupported status %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.feature_requests
     SET status = p_status,
         status_note = NULL,
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feature_request_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_feature_request_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_request_status_editor() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_feature_request_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.is_feature_request_status_editor() THEN
    NEW.status := OLD.status;
    NEW.status_note := OLD.status_note;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_feature_request_status ON public.feature_requests;
CREATE TRIGGER guard_feature_request_status
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_feature_request_status();

NOTIFY pgrst, 'reload schema';
