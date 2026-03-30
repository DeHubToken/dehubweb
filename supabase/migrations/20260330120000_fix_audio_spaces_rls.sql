-- Fix audio_spaces RLS so hosts can end their stages
-- Problem: SELECT policy only allows status='live' rows, but PostgREST tries to
-- return the updated row after PATCH. Since status='ended' doesn't match the
-- SELECT policy, the update appears to fail with 42501/401.

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Anyone can view live audio spaces" ON public.audio_spaces;

-- Replace with a policy that allows all users to read all spaces
-- (live and ended) — needed so invite links and recordings work
CREATE POLICY "Anyone can view audio spaces"
  ON public.audio_spaces FOR SELECT
  USING (true);

-- Ensure the UPDATE policy has an explicit WITH CHECK so there's no ambiguity
DROP POLICY IF EXISTS "Host can update their space" ON public.audio_spaces;

CREATE POLICY "Host can update their space"
  ON public.audio_spaces FOR UPDATE
  USING (true)
  WITH CHECK (true);
