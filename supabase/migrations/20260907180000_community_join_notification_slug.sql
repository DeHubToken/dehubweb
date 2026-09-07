-- APPLIED 2026-09-07 (via the live database — do not run twice).
--
-- notify_community_join() wrote the community UUID into reference_id, but
-- every consumer builds /app/communities/<slug> from that value, so a tapped
-- "joined your community" notification landed on a dead URL. Store the slug,
-- and backfill the rows already written.

CREATE OR REPLACE FUNCTION public.notify_community_join()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'active' AND NEW.role = 'member' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    )
    SELECT
      c.creator_wallet_address,
      NEW.wallet_address,
      'community_join',
      'joined your community',
      c.slug,
      c.name
    FROM public.communities c
    WHERE c.id = NEW.community_id
      AND c.slug IS NOT NULL
      AND lower(c.creator_wallet_address) != lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.custom_notifications n
   SET reference_id = c.slug
  FROM public.communities c
 WHERE n.type = 'community_join'
   AND n.reference_id = c.id::text
   AND c.slug IS NOT NULL;
