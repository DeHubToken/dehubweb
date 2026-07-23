CREATE OR REPLACE FUNCTION public.get_creator_gallery(p_limit integer DEFAULT 60)
RETURNS TABLE(id uuid, image_url text, video_url text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, image_url, video_url, created_at
  FROM public.ai_messages
  WHERE role = 'assistant'
    AND (image_url LIKE 'http%' OR video_url LIKE 'http%')
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 120);
$function$;

GRANT EXECUTE ON FUNCTION public.get_creator_gallery(integer) TO anon, authenticated, service_role;