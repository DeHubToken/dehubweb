-- Create table to cache leaderboard data
CREATE TABLE public.leaderboard_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sort_mode TEXT NOT NULL,
  period TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(sort_mode, period)
);

-- Enable RLS (public read, no public write)
ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read the cache
CREATE POLICY "Leaderboard cache is publicly readable" 
ON public.leaderboard_cache 
FOR SELECT 
USING (true);

-- Create index for fast lookups
CREATE INDEX idx_leaderboard_cache_lookup ON public.leaderboard_cache(sort_mode, period);

-- Enable pg_cron and pg_net for scheduled refreshes
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;