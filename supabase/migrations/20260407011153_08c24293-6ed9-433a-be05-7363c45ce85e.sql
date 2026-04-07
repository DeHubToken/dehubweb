CREATE OR REPLACE FUNCTION public.bulk_insert_category_log(entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.category_post_log (token_id, name, posted_at)
    SELECT
      (e->>'token_id')::integer,
      e->>'name',
      (e->>'posted_at')::timestamptz
    FROM jsonb_array_elements(entries) AS e
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;
  RETURN inserted;
END;
$$;