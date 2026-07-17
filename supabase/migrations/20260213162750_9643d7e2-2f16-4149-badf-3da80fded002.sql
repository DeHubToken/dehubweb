ALTER TABLE public.leaderboard_snapshots
  ADD COLUMN IF NOT EXISTS sent_tips numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_tips numeric NOT NULL DEFAULT 0;