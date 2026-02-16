
-- Create leaderboard_snapshots table for daily balance tracking
CREATE TABLE public.leaderboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(account, snapshot_date)
);

-- Create index for fast period lookups
CREATE INDEX idx_leaderboard_snapshots_date ON public.leaderboard_snapshots (snapshot_date DESC);
CREATE INDEX idx_leaderboard_snapshots_account ON public.leaderboard_snapshots (account);

-- Enable RLS
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read access (leaderboard data is public)
CREATE POLICY "Leaderboard snapshots are publicly readable"
ON public.leaderboard_snapshots
FOR SELECT
USING (true);

-- No insert/update/delete for anon - only service role (edge function) writes

-- Retention cleanup: delete snapshots older than 400 days
CREATE OR REPLACE FUNCTION public.cleanup_old_leaderboard_snapshots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM public.leaderboard_snapshots
  WHERE snapshot_date < CURRENT_DATE - INTERVAL '400 days';
$$;
