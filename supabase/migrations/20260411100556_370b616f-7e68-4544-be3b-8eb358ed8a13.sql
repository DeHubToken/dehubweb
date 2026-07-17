
CREATE OR REPLACE FUNCTION public.notify_community_join()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Only notify on active joins (not pending requests)
  IF NEW.status = 'active' AND NEW.role = 'member' THEN
    INSERT INTO public.custom_notifications (
      recipient_address,
      actor_address,
      type,
      content,
      reference_id,
      reference_title
    )
    SELECT
      c.creator_wallet_address,
      NEW.wallet_address,
      'community_join',
      'joined your community',
      c.id::text,
      c.name
    FROM public.communities c
    WHERE c.id = NEW.community_id
      AND lower(c.creator_wallet_address) != lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_community_member_join
  AFTER INSERT ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_join();

-- Also trigger when a pending member gets approved (status changes to active)
CREATE TRIGGER on_community_member_approved
  AFTER UPDATE OF status ON public.community_members
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'active')
  EXECUTE FUNCTION public.notify_community_join();
