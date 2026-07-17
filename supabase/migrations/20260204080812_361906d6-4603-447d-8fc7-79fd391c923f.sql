-- Create story_comments table
CREATE TABLE public.story_comments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    wallet_address text NOT NULL,
    username text,
    avatar text,
    content text NOT NULL,
    parent_id uuid REFERENCES public.story_comments(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view story comments
CREATE POLICY "Anyone can view story comments"
ON public.story_comments
FOR SELECT
USING (true);

-- Users can create their own comments
CREATE POLICY "Users can create their own comments"
ON public.story_comments
FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
ON public.story_comments
FOR DELETE
USING (lower(wallet_address) = get_request_wallet_address());

-- Create indexes for faster lookups
CREATE INDEX idx_story_comments_story_id ON public.story_comments(story_id);
CREATE INDEX idx_story_comments_parent_id ON public.story_comments(parent_id);