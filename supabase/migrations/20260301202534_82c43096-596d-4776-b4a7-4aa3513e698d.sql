
-- Fix governance_votes RLS: change restrictive policies to permissive
DROP POLICY "Anyone can view governance votes" ON public.governance_votes;
DROP POLICY "Users can create own governance votes" ON public.governance_votes;
DROP POLICY "Users can delete own governance votes" ON public.governance_votes;
DROP POLICY "Users can update own governance votes" ON public.governance_votes;

CREATE POLICY "Anyone can view governance votes"
  ON public.governance_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can create own governance votes"
  ON public.governance_votes FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete own governance votes"
  ON public.governance_votes FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update own governance votes"
  ON public.governance_votes FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());
