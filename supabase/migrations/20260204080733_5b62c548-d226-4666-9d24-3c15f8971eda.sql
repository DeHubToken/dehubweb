-- Create story_views table to track views
CREATE TABLE public.story_views (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_wallet_address text NOT NULL,
    viewed_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (story_id, viewer_wallet_address)
);

-- Enable RLS
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Anyone can view story view counts
CREATE POLICY "Anyone can view story views"
ON public.story_views
FOR SELECT
USING (true);

-- Users can record their own views
CREATE POLICY "Users can record their own views"
ON public.story_views
FOR INSERT
WITH CHECK (lower(viewer_wallet_address) = get_request_wallet_address());

-- Create index for faster lookups
CREATE INDEX idx_story_views_story_id ON public.story_views(story_id);