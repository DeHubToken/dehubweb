CREATE OR REPLACE FUNCTION public.get_creator_gallery(p_limit int DEFAULT 60)
RETURNS TABLE(id uuid, image_url text, video_url text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, image_url, video_url, created_at
  FROM public.ai_messages
  WHERE role = 'assistant'
    AND (image_url IS NOT NULL OR video_url IS NOT NULL)
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 120);
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_gallery(int) TO anon, authenticated, service_role;