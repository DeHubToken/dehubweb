-- Live sessions need a pulse, not just a row.
--
-- `live_stream_sessions` is a pure existence check: one row per stream, no TTL,
-- and the frontend never filtered on `started_at`. The post page ORs it with the
-- backend status, so a broadcast that ended without running its teardown — a
-- crashed tab, a killed browser, a laptop lid — left a row nobody deletes and a
-- post that claimed to be LIVE indefinitely, over a player that could never
-- load. The Live feed reads the backend instead, so the same stream showed as
-- ended there: two surfaces, two answers.
--
-- The broadcaster now touches this column while it is on air, and a row whose
-- pulse has stopped stops counting as live.

ALTER TABLE public.live_stream_sessions
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows predate the heartbeat. Seeding them from started_at means the
-- stale ones read as stale immediately rather than getting a fresh lease.
UPDATE public.live_stream_sessions
   SET heartbeat_at = started_at
 WHERE heartbeat_at IS NULL
    OR heartbeat_at < started_at;

-- The read path filters on this column on every post page load.
CREATE INDEX IF NOT EXISTS idx_live_stream_sessions_heartbeat_at
ON public.live_stream_sessions (heartbeat_at);
