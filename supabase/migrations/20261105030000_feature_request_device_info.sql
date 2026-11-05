-- Device info on Requests board posts, for the board owners only.
--
-- When someone posts a request (web or app), the client attaches a small
-- snapshot of where it was sent from: app version/build, OTA update, OS,
-- device model, browser, screen, theme, language, page, connection, timezone
-- and the last few client errors. It helps reproduce bug reports.
--
-- feature_requests is publicly readable, so the snapshot lives in its own
-- table with RLS on and no policies: nobody reads or writes it directly.
--   attach_feature_request_device_info()  the request's author, once, within
--                                          30 minutes of posting, max 8 KB
--   get_feature_request_device_info()      board owners only
--   feature_request_device_info_ids()      board owners only: which requests
--                                          have a snapshot (to show the row)
-- No IP, tokens or keys are collected by the clients.
-- NOTE: git-pushed migrations don't reliably auto-apply; run against prod via SQL.

CREATE TABLE IF NOT EXISTS public.feature_request_device_info (
  feature_request_id uuid PRIMARY KEY REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  info jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_request_device_info ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_request_device_info FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_feature_request_device_info(p_id uuid, p_info jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_author text;
  v_created timestamptz;
BEGIN
  IF p_info IS NULL OR jsonb_typeof(p_info) <> 'object' THEN
    RAISE EXCEPTION 'Device info must be an object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_info::text) > 8192 THEN
    RAISE EXCEPTION 'Device info too large' USING ERRCODE = '22001';
  END IF;

  SELECT lower(author_wallet_address), created_at INTO v_author, v_created
    FROM public.feature_requests WHERE id = p_id;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_author <> COALESCE(public.get_request_wallet_address(), '') THEN
    RAISE EXCEPTION 'Only the author can attach device info' USING ERRCODE = '42501';
  END IF;
  IF v_created < now() - interval '30 minutes' THEN
    RETURN false;
  END IF;

  INSERT INTO public.feature_request_device_info (feature_request_id, info)
  VALUES (p_id, p_info)
  ON CONFLICT (feature_request_id) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_feature_request_device_info(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_feature_request_status_editor() THEN
    RAISE EXCEPTION 'Only the board owners can see device info' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT info || jsonb_build_object('captured_at', created_at)
            FROM public.feature_request_device_info WHERE feature_request_id = p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.feature_request_device_info_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_feature_request_status_editor() THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT feature_request_id FROM public.feature_request_device_info;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_feature_request_device_info(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_request_device_info(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.feature_request_device_info_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_feature_request_device_info(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_request_device_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feature_request_device_info_ids() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
