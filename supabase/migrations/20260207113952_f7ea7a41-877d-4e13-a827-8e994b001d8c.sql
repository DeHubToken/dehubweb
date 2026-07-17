
-- Create feature_requests table
CREATE TABLE public.feature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'open',
  author_wallet_address TEXT NOT NULL,
  author_username TEXT,
  author_avatar TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create feature_request_votes table
CREATE TABLE public.feature_request_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_request_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  vote_type INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (feature_request_id, wallet_address)
);

-- Indexes
CREATE INDEX idx_feature_requests_category ON public.feature_requests(category);
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);
CREATE INDEX idx_feature_requests_vote_count ON public.feature_requests(vote_count DESC);
CREATE INDEX idx_feature_requests_created_at ON public.feature_requests(created_at DESC);
CREATE INDEX idx_feature_request_votes_feature_id ON public.feature_request_votes(feature_request_id);
CREATE INDEX idx_feature_request_votes_wallet ON public.feature_request_votes(wallet_address);

-- Enable RLS
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;

-- RLS for feature_requests
CREATE POLICY "Anyone can view feature requests"
  ON public.feature_requests FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create feature requests"
  ON public.feature_requests FOR INSERT
  WITH CHECK (lower(author_wallet_address) = get_request_wallet_address());

CREATE POLICY "Authors can update their own feature requests"
  ON public.feature_requests FOR UPDATE
  USING (lower(author_wallet_address) = get_request_wallet_address());

CREATE POLICY "Authors can delete their own feature requests"
  ON public.feature_requests FOR DELETE
  USING (lower(author_wallet_address) = get_request_wallet_address());

-- RLS for feature_request_votes
CREATE POLICY "Anyone can view votes"
  ON public.feature_request_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own votes"
  ON public.feature_request_votes FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update their own votes"
  ON public.feature_request_votes FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete their own votes"
  ON public.feature_request_votes FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Trigger function to recalculate vote_count (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.update_feature_request_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.feature_request_id;
  ELSE
    target_id := NEW.feature_request_id;
  END IF;

  UPDATE public.feature_requests
  SET vote_count = COALESCE((
    SELECT SUM(vote_type) FROM public.feature_request_votes
    WHERE feature_request_id = target_id
  ), 0)
  WHERE id = target_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on votes table
CREATE TRIGGER update_vote_count_on_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_request_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_request_vote_count();

-- Updated_at trigger for feature_requests
CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live vote count updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_requests;
