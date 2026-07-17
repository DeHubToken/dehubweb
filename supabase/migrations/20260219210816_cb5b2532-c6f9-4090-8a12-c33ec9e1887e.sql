
-- Create cleanup function for client_error_logs (30-day TTL)
CREATE OR REPLACE FUNCTION public.cleanup_old_client_error_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.client_error_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
$$;

-- Create cleanup function for story_views (7-day TTL)
CREATE OR REPLACE FUNCTION public.cleanup_old_story_views()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.story_views
  WHERE viewed_at < NOW() - INTERVAL '7 days';
$$;
