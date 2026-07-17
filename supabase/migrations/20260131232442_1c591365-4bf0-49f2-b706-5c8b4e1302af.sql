-- Create feed_cache table for server-side caching
CREATE TABLE public.feed_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by cache key
CREATE INDEX idx_feed_cache_key ON public.feed_cache(cache_key);

-- Index for checking cache freshness
CREATE INDEX idx_feed_cache_updated ON public.feed_cache(updated_at);

-- Enable RLS with public read access (feed is public data)
ALTER TABLE public.feed_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read the cached feed data
CREATE POLICY "Feed cache is publicly readable" 
ON public.feed_cache 
FOR SELECT 
USING (true);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_feed_cache_updated_at
BEFORE UPDATE ON public.feed_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();