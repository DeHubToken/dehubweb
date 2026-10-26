-- Battle scores for a co-stream round.
--
-- Each side scores the DHB its own stream is paid in gifts while the round
-- runs. The host's broadcaster is on air for the whole round and already
-- hears every confirmed gift on both streams, so it keeps the tally and
-- writes it here; viewers who arrive mid-round read the running totals
-- instead of starting from zero. Only the host can write the row (RLS on
-- live_costreams), and a new round always starts from nothing.

ALTER TABLE public.live_costreams
  ADD COLUMN IF NOT EXISTS battle_host_score numeric NOT NULL DEFAULT 0 CHECK (battle_host_score >= 0),
  ADD COLUMN IF NOT EXISTS battle_guest_score numeric NOT NULL DEFAULT 0 CHECK (battle_guest_score >= 0),
  -- Whose stream the guest side is: the partner the round was started against.
  ADD COLUMN IF NOT EXISTS battle_guest_wallet text CHECK (battle_guest_wallet IS NULL OR battle_guest_wallet ~ '^0x[a-f0-9]{40}$');

CREATE OR REPLACE FUNCTION public.reset_live_costream_battle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.battle_started_at IS DISTINCT FROM OLD.battle_started_at AND NEW.battle_started_at IS NOT NULL THEN
    NEW.battle_host_score := 0;
    NEW.battle_guest_score := 0;
    IF NEW.battle_guest_wallet IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.live_costream_guests g WHERE g.costream_id = NEW.id
        AND g.wallet = NEW.battle_guest_wallet AND g.status = 'accepted' AND g.stream_id IS NOT NULL) THEN
      SELECT g.wallet INTO NEW.battle_guest_wallet FROM public.live_costream_guests g
      WHERE g.costream_id = NEW.id AND g.status = 'accepted' AND g.stream_id IS NOT NULL
      ORDER BY g.updated_at LIMIT 1;
    END IF;
  ELSIF current_user IN ('anon', 'authenticated') AND NEW.battle_guest_wallet IS DISTINCT FROM OLD.battle_guest_wallet THEN
    -- The opponent is fixed for the round.
    NEW.battle_guest_wallet := OLD.battle_guest_wallet;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reset_live_costream_battle ON public.live_costreams;
-- Named to sort after guard_live_costream, which validates the round first.
CREATE TRIGGER reset_live_costream_battle BEFORE UPDATE ON public.live_costreams
FOR EACH ROW EXECUTE FUNCTION public.reset_live_costream_battle();
