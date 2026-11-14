-- Requests posted without a title get a short one written for them.
--
-- The composer stores the first line of the description as the title when the
-- title box is left empty, so the card says the same thing twice. The
-- feature-request-title function writes a proper heading; this migration gives
-- it a way in and calls it after every new request.

ALTER TABLE public.feature_requests
  ADD COLUMN IF NOT EXISTS title_auto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.feature_requests.title_auto IS
  'The title was written for the author because they left it empty. Set once; never rewritten.';

-- updated_at orders the board, so naming a request must not move it. The
-- shared trigger function stamps now() on every update; this one skips the
-- stamp inside apply_feature_request_auto_title only.
CREATE OR REPLACE FUNCTION public.feature_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('riftn.keep_updated_at', true), '') <> 'on' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_feature_requests_updated_at ON public.feature_requests;
CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_requests_touch_updated_at();

-- Replaces the title only if it is still exactly the one that was read, so an
-- edit the author made in the meantime always wins.
CREATE OR REPLACE FUNCTION public.apply_feature_request_auto_title(p_id uuid, p_expected text, p_title text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_done boolean;
BEGIN
  IF p_title IS NULL OR length(btrim(p_title)) < 3 OR length(p_title) > 100 THEN
    RETURN false;
  END IF;
  PERFORM set_config('riftn.keep_updated_at', 'on', true);
  UPDATE public.feature_requests
     SET title = btrim(p_title), title_auto = true
   WHERE id = p_id AND title = p_expected AND NOT title_auto;
  v_done := FOUND;
  PERFORM set_config('riftn.keep_updated_at', 'off', true);
  RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_feature_request_auto_title(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_feature_request_auto_title(uuid, text, text) TO service_role;

-- After a request is posted with no title of its own, ask for one. pg_net is
-- fire-and-forget, so posting never waits on it or fails because of it.
CREATE OR REPLACE FUNCTION public.request_feature_request_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(regexp_replace(COALESCE(NEW.description, ''), '\s+', ' ', 'g'))
     LIKE lower(regexp_replace(btrim(COALESCE(NEW.title, '')), '\s+', ' ', 'g')) || '%' THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/feature-request-title',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := jsonb_build_object('id', NEW.id),
        timeout_milliseconds := 30000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'feature-request-title call skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_title ON public.feature_requests;
CREATE TRIGGER on_feature_request_title
  AFTER INSERT ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.request_feature_request_title();

-- Safety net: one that missed its turn (model busy) is retried every 15 min.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'feature-request-titles') THEN
    PERFORM cron.unschedule('feature-request-titles');
  END IF;
  PERFORM cron.schedule(
    'feature-request-titles',
    '*/15 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/feature-request-title',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
END $do$;

NOTIFY pgrst, 'reload schema';
