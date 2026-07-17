
CREATE TABLE public.trending_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  post_count integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(name)
);

ALTER TABLE public.trending_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read trending categories
CREATE POLICY "Anyone can view trending categories"
  ON public.trending_categories
  FOR SELECT
  TO public
  USING (true);

-- Anyone can insert (upsert) trending categories
CREATE POLICY "Anyone can insert trending categories"
  ON public.trending_categories
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Anyone can update trending categories (for upsert increment)
CREATE POLICY "Anyone can update trending categories"
  ON public.trending_categories
  FOR UPDATE
  TO public
  USING (true);

-- Function to increment category count (upsert)
CREATE OR REPLACE FUNCTION public.increment_category_count(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trending_categories (name, post_count, updated_at)
  VALUES (LOWER(TRIM(p_name)), 1, now())
  ON CONFLICT (name)
  DO UPDATE SET
    post_count = trending_categories.post_count + 1,
    updated_at = now();
END;
$$;
