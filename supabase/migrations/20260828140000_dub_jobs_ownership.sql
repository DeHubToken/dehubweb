-- ============================================================================
-- A dub belongs to the wallet that started it.
-- ============================================================================
-- elevenlabs-dub is split into start / poll / collect so a dub survives a
-- reload: the client keeps the dubbing id and rejoins the job rather than
-- abandoning something already paid for.
--
-- The cost of that shape was that the id was the only thing standing between
-- anyone and the finished audio. The poll and collect branches took a dubbing
-- id and answered, with nothing tying the id to a person — so a creator's own
-- footage, translated, was fetchable by whoever held the id.
--
-- This is the missing half: the start branch records who began the job, and the
-- other two check the caller against it.

CREATE TABLE IF NOT EXISTS public.dub_jobs (
  -- The provider's id, so a lookup is the same key the client already holds.
  dubbing_id text PRIMARY KEY,
  wallet_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dub_jobs_wallet
  ON public.dub_jobs (wallet_address, created_at DESC);

COMMENT ON TABLE public.dub_jobs IS
  'Which wallet started which dub. Read by elevenlabs-dub to keep a job private to its owner.';

-- ============================================================================
-- Access
-- ============================================================================
-- Nothing reads this from a browser: the only reader is the edge function,
-- which holds the service role. Leaving it with RLS on and no client policy
-- means an anon or authenticated SELECT returns nothing at all, which is the
-- intent — the table is a map from a job id to an owner, and handing that out
-- would answer the very question it exists to refuse.

ALTER TABLE public.dub_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages dub jobs" ON public.dub_jobs;
CREATE POLICY "Service role manages dub jobs" ON public.dub_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
