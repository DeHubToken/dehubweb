-- APPLIED 2026-09-07 (against the live database — do not run twice).
--
-- notify_community_join() was rewritten twice in one afternoon by two changes
-- that each dropped the other's fix:
--
--   20260907170000  notifies on 'pending' as well as 'active', so a join
--                   *request* reaches the owner before approval — but writes
--                   c.id::text into reference_id.
--   20260907180000  writes c.slug into reference_id, which is what
--                   /app/communities/<key> is keyed on — but only fires on
--                   'active', so requests stopped notifying again.
--
-- The 170000 body is what is live, so the table now holds both reference forms
-- (124 slug rows, 6 uuid) and the tapped uuid rows open a dead page. This is
-- both fixes at once, and backfills what the mix left behind.
--
-- reference_id falls back to the uuid rather than skipping a community with no
-- slug: an owner not being told someone joined is worse than a link that needs
-- resolving, and the clients resolve either form.

CREATE OR REPLACE FUNCTION public.notify_community_join()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'member' AND NEW.status IN ('pending', 'active') THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT
      lower(c.creator_wallet_address),
      lower(NEW.wallet_address),
      'community_join',
      CASE
        WHEN NEW.status = 'pending' THEN 'requested to join your community'
        ELSE 'joined your community'
      END,
      coalesce(c.slug, c.id::text),
      c.name
    FROM public.communities c
    WHERE c.id = NEW.community_id
      AND lower(c.creator_wallet_address) <> lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$function$;

-- The rows written while the uuid version was live. A community that has since
-- been deleted has no slug to move to and keeps its uuid, which still opens.
UPDATE public.custom_notifications n
   SET reference_id = c.slug
  FROM public.communities c
 WHERE n.type = 'community_join'
   AND n.reference_id = c.id::text
   AND c.slug IS NOT NULL;
