-- Add INSERT policy for service role (the existing SELECT policy is RESTRICTIVE which might block service_role)
-- Drop and recreate the SELECT policy as PERMISSIVE
DROP POLICY IF EXISTS "Anyone can view draw results" ON public.winter_wonderland_results;
CREATE POLICY "Anyone can view draw results"
  ON public.winter_wonderland_results FOR SELECT
  TO public
  USING (true);

-- Allow service role to insert
CREATE POLICY "Service role can insert results"
  ON public.winter_wonderland_results FOR INSERT
  TO service_role
  WITH CHECK (true);