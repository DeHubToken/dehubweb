-- Santa Snake — all-time leaderboard (winter-theme easter egg in WinterSnow.tsx).
-- One row per player, keyed by wallet, holding that player's best run.

CREATE TABLE IF NOT EXISTS public.santa_snake_scores (
  wallet_address TEXT PRIMARY KEY,
  username TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Top-N ordering for the board.
CREATE INDEX IF NOT EXISTS idx_santa_snake_scores_score
  ON public.santa_snake_scores (score DESC);

ALTER TABLE public.santa_snake_scores ENABLE ROW LEVEL SECURITY;

-- The board is shown to everyone.
CREATE POLICY "Santa scores are publicly readable"
  ON public.santa_snake_scores FOR SELECT
  USING (true);

-- Wallet-native app (Web3Auth, not Supabase auth) => permissive writes, matching the
-- existing ai_conversations / user_privacy_settings pattern. The client only ever
-- upserts a higher score for its own connected wallet.
CREATE POLICY "Anyone can submit a santa score"
  ON public.santa_snake_scores FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update a santa score"
  ON public.santa_snake_scores FOR UPDATE
  USING (true);
