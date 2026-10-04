BEGIN;
-- Applicant replies use the same signed identity as the rest of the bounty system.
DO $$ BEGIN
 IF to_regclass('public.work_application_comments') IS NOT NULL THEN
  DROP POLICY IF EXISTS "Application participants can comment" ON public.work_application_comments;
  CREATE POLICY "Application participants can comment" ON public.work_application_comments FOR INSERT WITH CHECK (
   author_address=public.work_wallet() AND EXISTS(
    SELECT 1 FROM public.work_applications a JOIN public.work_jobs j ON j.id=a.job_id
    WHERE a.id=work_application_comments.application_id AND a.job_id=work_application_comments.job_id
      AND (lower(a.applicant_address)=work_application_comments.author_address OR lower(j.poster_address)=work_application_comments.author_address)
   )
  );
 END IF;
END $$;
COMMIT;
