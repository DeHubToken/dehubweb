
CREATE TABLE public.category_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.category_post_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert" ON public.category_post_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view" ON public.category_post_log FOR SELECT USING (true);
CREATE INDEX idx_category_post_log_posted_at ON public.category_post_log (posted_at DESC);

CREATE OR REPLACE FUNCTION public.increment_category_count(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.trending_categories (name, post_count, updated_at)
  VALUES (LOWER(TRIM(p_name)), 1, now())
  ON CONFLICT (name) DO UPDATE SET
    post_count = trending_categories.post_count + 1, updated_at = now();
  INSERT INTO public.category_post_log (name) VALUES (LOWER(TRIM(p_name)));
END;
$$;
