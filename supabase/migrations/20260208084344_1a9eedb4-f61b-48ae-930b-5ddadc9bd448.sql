
-- Create verified TV channels table
CREATE TABLE public.tv_channels_verified (
  id text PRIMARY KEY,
  name text NOT NULL,
  logo text,
  category text NOT NULL DEFAULT 'other',
  stream_url text NOT NULL,
  country text NOT NULL DEFAULT 'Other',
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  broken_reports integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

-- Create index for category filtering
CREATE INDEX idx_tv_channels_category ON public.tv_channels_verified (category);
CREATE INDEX idx_tv_channels_active ON public.tv_channels_verified (is_active);

-- Enable RLS
ALTER TABLE public.tv_channels_verified ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed for viewing channels)
CREATE POLICY "Anyone can view active TV channels"
  ON public.tv_channels_verified
  FOR SELECT
  USING (true);

-- No public write access - only service role can write
