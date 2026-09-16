-- Santa Snake scores: writes move behind the santa-score edge function.
--
-- The open INSERT/UPDATE policies let any anon-key caller set any wallet's
-- score. The function verifies the DeHub token, writes only for that wallet,
-- and only when the run beats its own best, using the service role. The
-- board itself stays publicly readable.

DROP POLICY IF EXISTS "Anyone can submit a santa score" ON public.santa_snake_scores;
DROP POLICY IF EXISTS "Anyone can update a santa score" ON public.santa_snake_scores;
