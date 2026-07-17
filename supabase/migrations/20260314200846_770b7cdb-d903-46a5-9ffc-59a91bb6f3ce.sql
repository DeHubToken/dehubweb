
-- Remove the duplicate category_post_log insert from increment_category_count
-- The sync-category-log edge function handles populating this table now
CREATE OR REPLACE FUNCTION public.increment_category_count(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.trending_categories (name, post_count, updated_at)
  VALUES (LOWER(TRIM(p_name)), 1, now())
  ON CONFLICT (name) DO UPDATE SET
    post_count = trending_categories.post_count + 1, updated_at = now();
  -- No longer insert into category_post_log here; the sync edge function handles it
END;
$function$;

-- Clean up the duplicate row (no token_id = inserted by app, not sync)
DELETE FROM public.category_post_log WHERE token_id IS NULL;
