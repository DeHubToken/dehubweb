
CREATE TABLE public.suggested_profiles_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  username text,
  display_name text,
  avatar_url text,
  followers integer DEFAULT 0,
  likes integer DEFAULT 0,
  badge_balance numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- No RLS needed - this is public read data
ALTER TABLE public.suggested_profiles_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read suggested profiles"
  ON public.suggested_profiles_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Index for ordering
CREATE INDEX idx_suggested_profiles_badge ON public.suggested_profiles_cache (badge_balance DESC);
