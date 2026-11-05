-- The board's owners can mark any request Not feasible, with an optional
-- short reason that shows on the card, and move it back again.
--
-- 'declined' already existed as a status (the open lists leave it out) and
-- status_note already holds a short tag. This lets set_feature_request_status()
-- write both, still only for feature_request_status_editor_wallets().
--
-- The two-argument version is replaced by one with p_note defaulting to NULL,
-- so older clients that call it with (p_id, p_status) keep working.
-- NOTE: git-pushed migrations don't reliably auto-apply; run against prod via SQL.

DROP FUNCTION IF EXISTS public.set_feature_request_status(uuid, text);

CREATE OR REPLACE FUNCTION public.set_feature_request_status(
  p_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS public.feature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.feature_requests;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.is_feature_request_status_editor() THEN
    RAISE EXCEPTION 'Only the board owners can change a request''s status'
      USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'in_progress', 'shipped', 'declined') THEN
    RAISE EXCEPTION 'Unsupported status %', p_status USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 280 THEN
    v_note := left(v_note, 280);
  END IF;

  UPDATE public.feature_requests
     SET status = p_status,
         status_note = CASE WHEN p_status = 'declined' THEN v_note ELSE NULL END,
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feature_request_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_feature_request_status(uuid, text, text) TO anon, authenticated;

-- The reason is the owners' words too: a plain client (the author editing
-- their own title) can no longer change it either.
CREATE OR REPLACE FUNCTION public.guard_feature_request_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.status_note IS DISTINCT FROM OLD.status_note)
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.is_feature_request_status_editor() THEN
    NEW.status := OLD.status;
    NEW.status_note := OLD.status_note;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
