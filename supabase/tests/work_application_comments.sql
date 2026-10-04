-- Run against a database with at least one application. All writes roll back.
BEGIN;
DO $$
DECLARE
  app record;
  poster_comment uuid;
  applicant_comment uuid;
  n integer;
BEGIN
  SELECT a.id, a.job_id, lower(a.applicant_address) AS applicant,
    lower(j.poster_address) AS poster, j.job_number
  INTO app FROM public.work_applications a JOIN public.work_jobs j ON j.id = a.job_id
  WHERE lower(a.applicant_address) <> lower(j.poster_address) ORDER BY a.created_at DESC LIMIT 1;
  IF app.id IS NULL THEN RAISE EXCEPTION 'An application fixture is required'; END IF;

  PERFORM set_config('dehub.request_wallet', 'v:' || app.poster, true);
  EXECUTE 'SET LOCAL ROLE anon';
  INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
  VALUES (app.job_id, app.id, app.poster, 'Poster comment verification') RETURNING id INTO poster_comment;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('dehub.request_wallet', 'v:' || app.applicant, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
  VALUES (app.job_id, app.id, app.applicant, 'Applicant response verification') RETURNING id INTO applicant_comment;

  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (app.job_id, app.id, app.poster, 'Impersonated author');
    RAISE EXCEPTION 'Impersonating another author was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (app.job_id, app.id, app.applicant, E' \n\t ');
    RAISE EXCEPTION 'Whitespace-only comment was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (app.job_id, app.id, app.applicant, repeat('x', 2001));
    RAISE EXCEPTION 'Overlong comment was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (gen_random_uuid(), app.id, app.applicant, 'Wrong bounty');
    RAISE EXCEPTION 'Cross-bounty application comment was allowed';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;

  BEGIN
    UPDATE public.work_application_comments SET body = 'Changed author text' WHERE id = poster_comment;
    RAISE EXCEPTION 'Updating a posted comment was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    DELETE FROM public.work_application_comments WHERE id = poster_comment;
    RAISE EXCEPTION 'Deleting a posted comment was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('dehub.request_wallet', 'v:0x0000000000000000000000000000000000000001', true);
  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (app.job_id, app.id, '0x0000000000000000000000000000000000000001', 'Unrelated wallet');
    RAISE EXCEPTION 'Unrelated wallet comment was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('dehub.request_wallet', 'v:', true);
  SELECT count(*) INTO n FROM public.work_application_comments WHERE id IN (poster_comment, applicant_comment);
  IF n <> 2 THEN RAISE EXCEPTION 'Public readers cannot see the saved comments'; END IF;
  BEGIN
    INSERT INTO public.work_application_comments (job_id, application_id, author_address, body)
    VALUES (app.job_id, app.id, '', 'Anonymous comment');
    RAISE EXCEPTION 'Anonymous comment was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO n FROM public.custom_notifications
  WHERE type = 'work_application_reply' AND reference_id = app.job_number::text
    AND ((reference_comment_id = poster_comment::text AND lower(recipient_address) = app.applicant)
      OR (reference_comment_id = applicant_comment::text AND lower(recipient_address) = app.poster));
  IF n <> 2 THEN RAISE EXCEPTION 'Reply notifications did not reach both participants'; END IF;
END;
$$;
ROLLBACK;
SELECT 'Application comment permissions, validation, and notifications passed; test writes rolled back' AS result;
