-- Create stories table with 24-hour expiry
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  video_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Enable RLS
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Anyone can view non-expired stories
CREATE POLICY "Anyone can view active stories"
ON public.stories
FOR SELECT
USING (expires_at > now());

-- Users can create their own stories
CREATE POLICY "Users can create their own stories"
ON public.stories
FOR INSERT
WITH CHECK (true);

-- Users can delete their own stories
CREATE POLICY "Users can delete their own stories"
ON public.stories
FOR DELETE
USING (wallet_address = (SELECT get_request_wallet_address()));

-- Create index for efficient querying
CREATE INDEX idx_stories_expires_at ON public.stories (expires_at DESC);
CREATE INDEX idx_stories_wallet_address ON public.stories (wallet_address);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

-- Create storage bucket for story videos
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('stories', 'stories', true, 52428800);

-- Storage policies for stories bucket
CREATE POLICY "Anyone can view story videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'stories');

CREATE POLICY "Authenticated users can upload stories"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'stories');

CREATE POLICY "Users can delete their own story videos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'stories' AND (storage.foldername(name))[1] = (SELECT get_request_wallet_address()));