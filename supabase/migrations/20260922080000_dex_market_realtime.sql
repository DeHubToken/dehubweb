-- Announce each new DHB/USDC snapshot so open /dex pages update on the write.
--
-- The snapshot is rebuilt once a minute and clients polled for it, so a price
-- move or someone else's order could sit up to a poll behind what the server
-- already knew. This publishes a one-row heartbeat over Realtime instead: the
-- page refetches when the snapshot actually changes, and the poll stays only as
-- the fallback for a dropped socket.
--
-- The heartbeat carries no market data. It is a revision counter — clients read
-- the snapshot through get_dex_market exactly as before, so nothing private is
-- exposed by putting this table on the wire.
--
-- dex_private.market_state is written inside sample_market's transaction, so
-- anything hanging off that write can take the snapshot down with it. The
-- announcement is therefore wrapped in its own block that swallows every error:
-- a missed heartbeat costs one poll interval, a failed snapshot costs the page.

CREATE TABLE IF NOT EXISTS public.dex_market_tick (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO public.dex_market_tick (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.dex_market_tick ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'dex_market_tick' AND policyname = 'Anyone can watch the DHB market heartbeat') THEN
    CREATE POLICY "Anyone can watch the DHB market heartbeat"
      ON public.dex_market_tick FOR SELECT USING (true);
  END IF;
END $$;

-- Realtime applies the SELECT policy above to every subscriber.
ALTER TABLE public.dex_market_tick REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dex_market_tick') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dex_market_tick;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION dex_private.announce_market()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  BEGIN
    INSERT INTO public.dex_market_tick (id, observed_at, revision)
    VALUES (true, clock_timestamp(), 1)
    ON CONFLICT (id) DO UPDATE
      SET observed_at = excluded.observed_at,
          revision = public.dex_market_tick.revision + 1;
  EXCEPTION WHEN OTHERS THEN
    -- An announcement that fails must never cost the snapshot that produced it.
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION dex_private.announce_market() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS announce_market ON dex_private.market_state;
CREATE TRIGGER announce_market
  AFTER UPDATE ON dex_private.market_state
  FOR EACH ROW
  WHEN (new.payload IS DISTINCT FROM old.payload)
  EXECUTE FUNCTION dex_private.announce_market();
