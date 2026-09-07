-- Requests must reach the owner before approval, not only after it.
CREATE OR REPLACE FUNCTION public.notify_community_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'member' AND NEW.status IN ('pending', 'active') THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT lower(c.creator_wallet_address), lower(NEW.wallet_address),
      'community_join',
      CASE WHEN NEW.status = 'pending' THEN 'requested to join your community'
           ELSE 'joined your community' END,
      c.id::text, c.name
    FROM public.communities c
    WHERE c.id = NEW.community_id
      AND lower(c.creator_wallet_address) <> lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$$;

-- Recover requests that were saved while their notifications were skipped.
-- Keep this repeatable without duplicating an alert for the same request.
INSERT INTO public.custom_notifications (
  recipient_address, actor_address, type, content, reference_id, reference_title
)
SELECT lower(c.creator_wallet_address), lower(m.wallet_address),
  'community_join', 'requested to join your community', c.id::text, c.name
FROM public.community_members m
JOIN public.communities c ON c.id = m.community_id
WHERE m.status = 'pending' AND m.role = 'member'
  AND lower(c.creator_wallet_address) <> lower(m.wallet_address)
  AND NOT EXISTS (
    SELECT 1 FROM public.custom_notifications n
    WHERE n.type = 'community_join'
      AND n.content = 'requested to join your community'
      AND n.reference_id = c.id::text
      AND lower(n.recipient_address) = lower(c.creator_wallet_address)
      AND lower(n.actor_address) = lower(m.wallet_address)
      AND n.created_at >= m.joined_at
  );
