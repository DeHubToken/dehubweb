-- Add social metric columns to leaderboard_snapshots for tracking followers, likes, subscribers over time
ALTER TABLE public.leaderboard_snapshots
  ADD COLUMN IF NOT EXISTS followers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscribers integer DEFAULT 0;