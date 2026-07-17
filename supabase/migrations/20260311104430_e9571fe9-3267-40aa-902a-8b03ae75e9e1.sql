CREATE TABLE public.winter_wonderland_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date timestamp with time zone NOT NULL DEFAULT now(),
  results jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.winter_wonderland_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view draw results"
  ON public.winter_wonderland_results FOR SELECT
  TO public
  USING (true);
