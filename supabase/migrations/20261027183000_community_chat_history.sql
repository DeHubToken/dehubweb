-- Read-only, versioned history contract shared by web and mobile.
-- Existing signed-wallet identity and row-level policies remain authoritative.
CREATE INDEX IF NOT EXISTS idx_community_chat_cursor
  ON public.community_chat_messages (community_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.community_chat_page_v1(
  _community_id uuid,
  _before_at timestamptz DEFAULT NULL,
  _before_id uuid DEFAULT NULL,
  _anchor_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  private_chat boolean;
  anchor_at timestamptz;
  selected_rows jsonb;
  page_rows jsonb;
  references_json jsonb;
  pinned_json jsonb;
  cursor_json jsonb := NULL;
BEGIN
  IF _limit IS NULL OR _limit < 1 OR _limit > 100
     OR (_before_at IS NULL) <> (_before_id IS NULL)
     OR (_anchor_id IS NOT NULL AND _before_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid history cursor' USING ERRCODE = '22023';
  END IF;
  SELECT c.is_private INTO private_chat FROM public.communities c WHERE c.id = _community_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community unavailable' USING ERRCODE = '42501';
  END IF;
  IF private_chat AND NOT public.community_is_active_member(
    _community_id, public.get_signed_request_wallet_address()
  ) THEN
    RAISE EXCEPTION 'Community unavailable' USING ERRCODE = '42501';
  END IF;
  IF _anchor_id IS NOT NULL THEN
    SELECT m.created_at INTO anchor_at FROM public.community_chat_messages m
      WHERE m.community_id = _community_id AND m.id = _anchor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Message unavailable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC, m.id DESC), '[]'::jsonb)
    INTO selected_rows
    FROM (
      SELECT * FROM public.community_chat_messages m
      WHERE m.community_id = _community_id
        AND (_before_at IS NULL OR (m.created_at, m.id) < (_before_at, _before_id))
        AND (_anchor_id IS NULL OR (m.created_at, m.id) <= (anchor_at, _anchor_id))
      ORDER BY m.created_at DESC, m.id DESC LIMIT _limit + 1
    ) m;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal), '[]'::jsonb) INTO page_rows
    FROM jsonb_array_elements(selected_rows) WITH ORDINALITY AS rows(value, ordinal)
    WHERE ordinal <= _limit;
  IF jsonb_array_length(selected_rows) > _limit THEN
    cursor_json := jsonb_build_object(
      'created_at', page_rows -> (_limit - 1) ->> 'created_at',
      'id', page_rows -> (_limit - 1) ->> 'id'
    );
  END IF;

  SELECT to_jsonb(m) INTO pinned_json FROM public.community_chat_messages m
    WHERE m.community_id = _community_id AND m.pinned_at IS NOT NULL
    ORDER BY m.pinned_at DESC, m.created_at DESC, m.id DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO references_json FROM public.community_chat_messages m
    WHERE m.community_id = _community_id AND m.id IN (
      SELECT (value ->> 'reply_to_id')::uuid FROM jsonb_array_elements(page_rows)
      WHERE value ->> 'reply_to_id' IS NOT NULL
    );
  RETURN jsonb_build_object('messages', page_rows, 'references', references_json,
    'pinned_message', pinned_json, 'next_cursor', cursor_json);
END;
$$;
REVOKE ALL ON FUNCTION public.community_chat_page_v1(uuid,timestamptz,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_chat_page_v1(uuid,timestamptz,uuid,uuid,integer)
  TO anon, authenticated, service_role;
