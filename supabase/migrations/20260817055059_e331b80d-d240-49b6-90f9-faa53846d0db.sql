CREATE OR REPLACE FUNCTION public.community_notify_mentions(
  _community_id UUID,
  _message_id   UUID,
  _mentions     TEXT[] DEFAULT NULL,
  _here         BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  HERE_WINDOW CONSTANT INTERVAL := INTERVAL '10 minutes';
  actor       TEXT;
  slug        TEXT;
  community   TEXT;
  msg         public.community_chat_messages%ROWTYPE;
  preview     TEXT;
  targets     TEXT[];
  broadcast   BOOLEAN := coalesce(_here, false);
  written     INTEGER := 0;
  batch       INTEGER;
BEGIN
  actor := public.community_assert(_community_id, 'send_messages');

  SELECT c.slug, c.name INTO slug, community
    FROM public.communities c WHERE c.id = _community_id;
  IF slug IS NULL THEN
    RAISE EXCEPTION 'community_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO msg
    FROM public.community_chat_messages
   WHERE id = _message_id AND community_id = _community_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF lower(msg.wallet_address) <> lower(actor) THEN
    RAISE EXCEPTION 'cannot_notify_for_another_members_message' USING ERRCODE = '42501';
  END IF;

  preview := left(coalesce(msg.content, ''), 140);

  IF broadcast THEN
    IF EXISTS (
      SELECT 1 FROM public.custom_notifications
       WHERE type = 'community_here'
         AND lower(actor_address) = lower(actor)
         AND reference_id = slug
         AND created_at > now() - HERE_WINDOW
    ) THEN
      RAISE EXCEPTION 'here_rate_limited' USING ERRCODE = '53400';
    END IF;

    INSERT INTO public.custom_notifications
      (recipient_address, actor_address, actor_username, actor_avatar,
       type, content, reference_id, reference_title)
    SELECT lower(m.wallet_address), lower(actor), msg.username, msg.avatar_url,
           'community_here', preview, slug, community
      FROM public.community_members m
     WHERE m.community_id = _community_id
       AND m.status = 'active'
       AND lower(m.wallet_address) <> lower(actor);

    GET DIAGNOSTICS batch = ROW_COUNT;
    written := written + batch;
  END IF;

  IF NOT broadcast AND _mentions IS NOT NULL AND array_length(_mentions, 1) > 0 THEN
    SELECT array_agg(DISTINCT lower(w)) INTO targets
      FROM unnest(_mentions) AS w
     WHERE lower(w) <> lower(actor);

    IF targets IS NOT NULL THEN
      INSERT INTO public.custom_notifications
        (recipient_address, actor_address, actor_username, actor_avatar,
         type, content, reference_id, reference_title)
      SELECT lower(m.wallet_address), lower(actor), msg.username, msg.avatar_url,
             'community_mention', preview, slug, community
        FROM public.community_members m
       WHERE m.community_id = _community_id
         AND m.status = 'active'
         AND lower(m.wallet_address) = ANY(targets);

      GET DIAGNOSTICS batch = ROW_COUNT;
      written := written + batch;
    END IF;
  END IF;

  RETURN written;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_notify_mentions(UUID, UUID, TEXT[], BOOLEAN)
  TO anon, authenticated;