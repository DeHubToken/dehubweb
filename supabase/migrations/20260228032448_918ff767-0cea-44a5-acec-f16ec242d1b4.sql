
-- Governance proposals table (mirrors feature_requests structure)
CREATE TABLE public.governance_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  author_wallet_address TEXT NOT NULL,
  author_username TEXT,
  author_avatar TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  dislike_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Governance votes table (with vote_weight for badge multiplier)
CREATE TABLE public.governance_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.governance_proposals(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  vote_type INTEGER NOT NULL,
  vote_weight INTEGER NOT NULL DEFAULT 1,
  badge_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, wallet_address)
);

-- Governance comments table
CREATE TABLE public.governance_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.governance_proposals(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_governance_proposals_status ON public.governance_proposals(status);
CREATE INDEX idx_governance_votes_proposal ON public.governance_votes(proposal_id);
CREATE INDEX idx_governance_votes_wallet ON public.governance_votes(wallet_address);
CREATE INDEX idx_governance_comments_proposal ON public.governance_comments(proposal_id);

-- Enable RLS
ALTER TABLE public.governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_comments ENABLE ROW LEVEL SECURITY;

-- Proposals RLS
CREATE POLICY "Anyone can view governance proposals"
ON public.governance_proposals FOR SELECT USING (true);

CREATE POLICY "Users can create governance proposals"
ON public.governance_proposals FOR INSERT
WITH CHECK (lower(author_wallet_address) = get_request_wallet_address());

CREATE POLICY "Authors can update own proposals"
ON public.governance_proposals FOR UPDATE
USING (lower(author_wallet_address) = get_request_wallet_address());

CREATE POLICY "Authors can delete own proposals"
ON public.governance_proposals FOR DELETE
USING (lower(author_wallet_address) = get_request_wallet_address());

-- Votes RLS
CREATE POLICY "Anyone can view governance votes"
ON public.governance_votes FOR SELECT USING (true);

CREATE POLICY "Users can create own governance votes"
ON public.governance_votes FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update own governance votes"
ON public.governance_votes FOR UPDATE
USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete own governance votes"
ON public.governance_votes FOR DELETE
USING (lower(wallet_address) = get_request_wallet_address());

-- Comments RLS
CREATE POLICY "Anyone can view governance comments"
ON public.governance_comments FOR SELECT USING (true);

CREATE POLICY "Users can create own governance comments"
ON public.governance_comments FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete own governance comments"
ON public.governance_comments FOR DELETE
USING (lower(wallet_address) = get_request_wallet_address());

-- Trigger: update comment count
CREATE OR REPLACE FUNCTION public.update_governance_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.proposal_id;
  ELSE target_id := NEW.proposal_id;
  END IF;

  UPDATE public.governance_proposals
  SET comment_count = (
    SELECT COUNT(*) FROM public.governance_comments WHERE proposal_id = target_id
  )
  WHERE id = target_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_governance_comment_count
AFTER INSERT OR DELETE ON public.governance_comments
FOR EACH ROW EXECUTE FUNCTION public.update_governance_comment_count();

-- Trigger: update weighted vote count
CREATE OR REPLACE FUNCTION public.update_governance_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD.proposal_id;
  ELSE target_id := NEW.proposal_id;
  END IF;

  UPDATE public.governance_proposals
  SET
    vote_count = COALESCE((SELECT SUM(vote_type * vote_weight) FROM public.governance_votes WHERE proposal_id = target_id), 0),
    like_count = COALESCE((SELECT SUM(vote_weight) FROM public.governance_votes WHERE proposal_id = target_id AND vote_type = 1), 0),
    dislike_count = COALESCE((SELECT SUM(vote_weight) FROM public.governance_votes WHERE proposal_id = target_id AND vote_type = -1), 0)
  WHERE id = target_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_governance_vote_count
AFTER INSERT OR UPDATE OR DELETE ON public.governance_votes
FOR EACH ROW EXECUTE FUNCTION public.update_governance_vote_count();

-- Trigger: update updated_at
CREATE TRIGGER update_governance_proposals_updated_at
BEFORE UPDATE ON public.governance_proposals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
