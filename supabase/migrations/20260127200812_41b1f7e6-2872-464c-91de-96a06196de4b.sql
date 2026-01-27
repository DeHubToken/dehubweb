-- Create table for creator applications
CREATE TABLE public.creator_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  x_username TEXT,
  youtube_username TEXT,
  twitch_username TEXT,
  instagram_username TEXT,
  total_follower_reach TEXT NOT NULL,
  other_socials TEXT,
  email TEXT NOT NULL,
  expected_compensation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit creator application"
ON public.creator_applications
FOR INSERT
WITH CHECK (true);

-- Only you (admin) can read - no public SELECT policy
-- You'll query via Supabase dashboard/SQL