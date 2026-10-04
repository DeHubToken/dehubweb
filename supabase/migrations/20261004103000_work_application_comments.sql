-- Keep applicant discussions on the bounty, shared by web and mobile.
CREATE UNIQUE INDEX IF NOT EXISTS work_applications_id_job_id_key
  ON public.work_applications (id, job_id);

CREATE TABLE IF NOT EXISTS public.work_application_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  application_id uuid NOT NULL,
  author_address text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND body !~ '^[[:space:]]*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (application_id, job_id)
    REFERENCES public.work_applications (id, job_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS work_application_comments_job_created
  ON public.work_application_comments (job_id, created_at, id);
CREATE INDEX IF NOT EXISTS work_application_comments_application
  ON public.work_application_comments (application_id);

ALTER TABLE public.work_application_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_application_comments FROM anon, authenticated;
GRANT SELECT, INSERT ON public.work_application_comments TO anon, authenticated;
GRANT ALL ON public.work_application_comments TO service_role;

DROP POLICY IF EXISTS "Anyone can read application comments" ON public.work_application_comments;
CREATE POLICY "Anyone can read application comments"
  ON public.work_application_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Application participants can comment" ON public.work_application_comments;
CREATE POLICY "Application participants can comment"
  ON public.work_application_comments FOR INSERT WITH CHECK (
    author_address = public.get_request_wallet_address()
    AND author_address <> ''
    AND EXISTS (
      SELECT 1 FROM public.work_applications a
      JOIN public.work_jobs j ON j.id = a.job_id
      WHERE a.id = work_application_comments.application_id
        AND a.job_id = work_application_comments.job_id
        AND (lower(a.applicant_address) = work_application_comments.author_address
          OR lower(j.poster_address) = work_application_comments.author_address)
    )
  );

CREATE OR REPLACE FUNCTION public.notify_work_application_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, type, content, reference_id, reference_title, reference_comment_id
  )
  SELECT
    CASE WHEN lower(NEW.author_address) = lower(j.poster_address)
      THEN a.applicant_address ELSE j.poster_address END,
    NEW.author_address, 'work_application_reply', 'replied on your bounty',
    j.job_number::text, j.title, NEW.id::text
  FROM public.work_applications a JOIN public.work_jobs j ON j.id = a.job_id
  WHERE a.id = NEW.application_id AND j.id = NEW.job_id
    AND lower(a.applicant_address) <> lower(j.poster_address);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_work_application_comment ON public.work_application_comments;
CREATE TRIGGER trg_notify_work_application_comment
  AFTER INSERT ON public.work_application_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_work_application_comment();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'work_application_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_application_comments;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
