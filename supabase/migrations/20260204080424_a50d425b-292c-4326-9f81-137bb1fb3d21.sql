-- Create story reactions table for likes/dislikes
CREATE TABLE public.story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(story_id, wallet_address)
);

-- Enable RLS
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can view reaction counts
CREATE POLICY "Anyone can view story reactions"
  ON public.story_reactions FOR SELECT USING (true);

-- Users can create their own reactions
CREATE POLICY "Users can create their own reactions"
  ON public.story_reactions FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- Users can update their own reactions (switch between like/dislike)
CREATE POLICY "Users can update their own reactions"
  ON public.story_reactions FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Users can delete their own reactions (toggle off)
CREATE POLICY "Users can delete their own reactions"
  ON public.story_reactions FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());