-- Tell a bounty poster when someone applies or submits work.
--
-- Nothing did: applications and submissions only surfaced if the poster
-- happened to reopen the bounty. Both paths fan a row into
-- custom_notifications the same way store orders and fraction offers already
-- do, so the existing notifications UI picks them up with no polling.
--
-- reference_id carries job_number (not the uuid) because that is what
-- /bounty/<n> — the canonical bounty URL — is keyed on.

CREATE OR REPLACE FUNCTION public.notify_work_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT
    j.poster_address,
    NEW.applicant_address,
    'work_application',
    'applied to your bounty',
    j.job_number::text,
    j.title
  FROM public.work_jobs j
  WHERE j.id = NEW.job_id
    -- Posting and then applying to your own bounty is legal; notifying
    -- yourself about it is just noise.
    AND lower(j.poster_address) <> lower(NEW.applicant_address);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_work_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title
  )
  SELECT
    j.poster_address,
    NEW.worker_address,
    'work_submission',
    'submitted work on your bounty',
    j.job_number::text,
    j.title
  FROM public.work_jobs j
  WHERE j.id = NEW.job_id
    AND lower(j.poster_address) <> lower(NEW.worker_address);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_work_application ON public.work_applications;
CREATE TRIGGER trg_notify_work_application
  AFTER INSERT ON public.work_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_application();

DROP TRIGGER IF EXISTS trg_notify_work_submission ON public.work_submissions;
CREATE TRIGGER trg_notify_work_submission
  AFTER INSERT ON public.work_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_submission();
