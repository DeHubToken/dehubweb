-- Co-streaming: guests on screen during a video live, head-to-head gift
-- battles, and a queue that pairs live creators who want a partner.
--
-- The video itself never touches these tables. Guests meet the host on an
-- Agora channel named `costream-<live_costreams.id>`, and the host's browser
-- mixes them into the picture it already publishes. These rows only say who
-- is allowed on that channel (agora-token reads them before minting a
-- publisher token) and what viewers should be told about it.
--
-- Identity is the signed wallet (get_signed_request_wallet_address), the
-- same rule the call and stage tables use. Rows are world-readable on
-- purpose: who is on a public live is public, and viewers need it to label
-- the guests and draw the battle bar.

CREATE TABLE IF NOT EXISTS public.live_costreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_wallet text NOT NULL CHECK (host_wallet ~ '^0x[a-f0-9]{40}$'),
  host_stream_id text NOT NULL CHECK (length(host_stream_id) BETWEEN 1 AND 64),
  -- Display only, written by the host for the invite page and share card.
  host_username text CHECK (host_username IS NULL OR length(host_username) <= 64),
  accepting_requests boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  battle_started_at timestamptz,
  battle_ends_at timestamptz,
  battle_round integer NOT NULL DEFAULT 0 CHECK (battle_round >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- One open room per host. A second "start" reuses the first.
CREATE UNIQUE INDEX IF NOT EXISTS live_costreams_one_active
  ON public.live_costreams (host_wallet) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS live_costreams_active_stream
  ON public.live_costreams (host_stream_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.live_costream_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  costream_id uuid NOT NULL REFERENCES public.live_costreams(id) ON DELETE CASCADE,
  wallet text NOT NULL CHECK (wallet ~ '^0x[a-f0-9]{40}$'),
  -- The guest's own live, when they are broadcasting too. A battle scores
  -- each side on the gifts its own stream receives, so a battle needs one.
  stream_id text CHECK (stream_id IS NULL OR length(stream_id) BETWEEN 1 AND 64),
  username text CHECK (username IS NULL OR length(username) <= 64),
  status text NOT NULL CHECK (status IN ('invited', 'requested', 'accepted', 'declined', 'removed', 'left')),
  muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (costream_id, wallet)
);
CREATE INDEX IF NOT EXISTS live_costream_guests_wallet
  ON public.live_costream_guests (wallet, status);
CREATE INDEX IF NOT EXISTS live_costream_guests_stream
  ON public.live_costream_guests (stream_id) WHERE status = 'accepted';

-- Matchmaking. Never read or written directly; the RPCs below own it.
CREATE TABLE IF NOT EXISTS public.live_costream_queue (
  wallet text PRIMARY KEY CHECK (wallet ~ '^0x[a-f0-9]{40}$'),
  stream_id text NOT NULL CHECK (length(stream_id) BETWEEN 1 AND 64),
  username text CHECK (username IS NULL OR length(username) <= 64),
  joined_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now(),
  matched_costream_id uuid REFERENCES public.live_costreams(id) ON DELETE SET NULL
);

ALTER TABLE public.live_costreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_costream_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_costream_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.live_costream_queue FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE ON public.live_costreams, public.live_costream_guests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.live_costreams, public.live_costream_guests TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_signed_costream_host(p_costream_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.live_costreams c WHERE c.id = p_costream_id
    AND c.host_wallet = nullif(public.get_signed_request_wallet_address(), ''));
$$;
REVOKE ALL ON FUNCTION public.is_signed_costream_host(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_signed_costream_host(uuid) TO anon, authenticated, service_role;

CREATE POLICY costream_read ON public.live_costreams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY costream_host_insert ON public.live_costreams FOR INSERT TO anon, authenticated
  WITH CHECK (host_wallet = nullif(public.get_signed_request_wallet_address(), '') AND status = 'active'
    AND battle_started_at IS NULL AND battle_ends_at IS NULL);
CREATE POLICY costream_host_update ON public.live_costreams FOR UPDATE TO anon, authenticated
  USING (host_wallet = nullif(public.get_signed_request_wallet_address(), ''))
  WITH CHECK (host_wallet = nullif(public.get_signed_request_wallet_address(), ''));

CREATE POLICY costream_guest_read ON public.live_costream_guests FOR SELECT TO anon, authenticated USING (true);
-- The host invites anyone; anyone asks to join a room that is taking requests.
CREATE POLICY costream_guest_insert ON public.live_costream_guests FOR INSERT TO anon, authenticated
  WITH CHECK (
    (status = 'invited' AND public.is_signed_costream_host(costream_id))
    OR (status = 'requested' AND wallet = nullif(public.get_signed_request_wallet_address(), '')
      AND EXISTS (SELECT 1 FROM public.live_costreams c WHERE c.id = costream_id
        AND c.status = 'active' AND c.accepting_requests))
  );
CREATE POLICY costream_guest_update ON public.live_costream_guests FOR UPDATE TO anon, authenticated
  USING (wallet = nullif(public.get_signed_request_wallet_address(), '') OR public.is_signed_costream_host(costream_id))
  WITH CHECK (wallet = nullif(public.get_signed_request_wallet_address(), '') OR public.is_signed_costream_host(costream_id));

-- Rooms: identity is fixed, an ended room stays ended, and a battle round
-- needs a guest who is live on their own stream to score against.
CREATE OR REPLACE FUNCTION public.guard_live_costream()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.host_wallet IS DISTINCT FROM OLD.host_wallet
      OR NEW.host_stream_id IS DISTINCT FROM OLD.host_stream_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Co-stream identity is fixed' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'ended' AND NEW.status <> 'ended' THEN
      RAISE EXCEPTION 'An ended co-stream cannot reopen' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'ended' AND OLD.status <> 'ended' THEN NEW.ended_at := now(); END IF;
    IF NEW.battle_started_at IS DISTINCT FROM OLD.battle_started_at AND NEW.battle_started_at IS NOT NULL THEN
      IF NEW.battle_ends_at IS NULL
        OR NEW.battle_ends_at - NEW.battle_started_at < interval '30 seconds'
        OR NEW.battle_ends_at - NEW.battle_started_at > interval '15 minutes'
        OR abs(extract(epoch FROM NEW.battle_started_at - now())) > 120 THEN
        RAISE EXCEPTION 'A battle round runs 30 seconds to 15 minutes from now' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.live_costream_guests g WHERE g.costream_id = NEW.id
        AND g.status = 'accepted' AND g.stream_id IS NOT NULL) THEN
        RAISE EXCEPTION 'A battle needs a guest who is live' USING ERRCODE = '22023';
      END IF;
      NEW.battle_round := OLD.battle_round + 1;
    ELSIF NEW.battle_round IS DISTINCT FROM OLD.battle_round THEN
      NEW.battle_round := OLD.battle_round;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_live_costream ON public.live_costreams;
CREATE TRIGGER guard_live_costream BEFORE INSERT OR UPDATE ON public.live_costreams
FOR EACH ROW EXECUTE FUNCTION public.guard_live_costream();

-- Seats. Who may move a seat to which state:
--   host:  requested -> accepted | declined, anything -> removed,
--          declined | left | removed -> invited (ask again), mute either way
--   guest: invited -> accepted | declined, accepted -> left,
--          declined | left -> requested
-- Nobody but the host can unmute a guest, and at most three are on screen.
CREATE OR REPLACE FUNCTION public.guard_live_costream_guest()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  w text;
  is_host boolean;
  room public.live_costreams%ROWTYPE;
BEGIN
  NEW.updated_at := now();
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  w := nullif(public.get_signed_request_wallet_address(), '');
  SELECT * INTO room FROM public.live_costreams c WHERE c.id = NEW.costream_id;
  IF room.id IS NULL OR room.status <> 'active' THEN
    RAISE EXCEPTION 'That co-stream has ended' USING ERRCODE = '42501';
  END IF;
  IF NEW.wallet = room.host_wallet THEN
    RAISE EXCEPTION 'The host is already on screen' USING ERRCODE = '22023';
  END IF;
  is_host := room.host_wallet = w;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('invited', 'requested') THEN
      RAISE EXCEPTION 'A seat starts as an invite or a request' USING ERRCODE = '42501';
    END IF;
    NEW.muted := false;
    -- A guest's stream is theirs to state, never the host's.
    IF is_host THEN NEW.stream_id := NULL; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.costream_id IS DISTINCT FROM OLD.costream_id
    OR NEW.wallet IS DISTINCT FROM OLD.wallet OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Seat identity is fixed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF is_host AND NOT (
      (OLD.status = 'requested' AND NEW.status IN ('accepted', 'declined'))
      OR NEW.status = 'removed'
      OR (OLD.status IN ('declined', 'left', 'removed') AND NEW.status = 'invited')
    ) THEN
      RAISE EXCEPTION 'The host cannot make that change' USING ERRCODE = '42501';
    END IF;
    IF NOT is_host AND NOT (
      (OLD.status = 'invited' AND NEW.status IN ('accepted', 'declined'))
      OR (OLD.status = 'accepted' AND NEW.status = 'left')
      OR (OLD.status IN ('declined', 'left') AND NEW.status = 'requested' AND room.accepting_requests)
    ) THEN
      RAISE EXCEPTION 'You cannot make that change' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'accepted' AND (SELECT count(*) FROM public.live_costream_guests g
      WHERE g.costream_id = NEW.costream_id AND g.status = 'accepted' AND g.id <> NEW.id) >= 3 THEN
      RAISE EXCEPTION 'Three guests are already on screen' USING ERRCODE = '22023';
    END IF;
    -- A fresh seat starts unmuted.
    IF NEW.status IN ('invited', 'requested') THEN NEW.muted := false; END IF;
  END IF;

  IF NOT is_host THEN
    -- Only the host mutes or unmutes.
    NEW.muted := OLD.muted;
  ELSE
    -- The guest's own stream and name are the guest's to state.
    NEW.stream_id := OLD.stream_id;
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_live_costream_guest ON public.live_costream_guests;
CREATE TRIGGER guard_live_costream_guest BEFORE INSERT OR UPDATE ON public.live_costream_guests
FOR EACH ROW EXECUTE FUNCTION public.guard_live_costream_guest();

-- ── Matchmaking ───────────────────────────────────────────────────────────
-- A creator who is live asks for a partner. If someone else is waiting (and
-- has checked in within the last 20 seconds), the one who waited longer
-- hosts: the newcomer is seated in their room as an accepted guest with
-- their own stream attached, which is all a battle needs. Otherwise the
-- caller waits, and costream_queue_poll tells them when they were picked.

CREATE OR REPLACE FUNCTION public.costream_queue_join(p_stream_id text, p_username text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w text := nullif(public.get_signed_request_wallet_address(), '');
  partner public.live_costream_queue%ROWTYPE;
  room_id uuid;
  waiting integer;
BEGIN
  IF w IS NULL THEN RAISE EXCEPTION 'Sign in to find a co-streamer' USING ERRCODE = '42501'; END IF;
  IF p_stream_id IS NULL OR length(p_stream_id) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Go live first' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('live_costream_queue'));

  SELECT * INTO partner FROM public.live_costream_queue q
  WHERE q.wallet <> w AND q.matched_costream_id IS NULL AND q.seen_at > now() - interval '20 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.live_costreams c JOIN public.live_costream_guests g ON g.costream_id = c.id
      WHERE c.host_wallet = q.wallet AND c.status = 'active' AND g.status = 'accepted')
  ORDER BY q.joined_at
  LIMIT 1;

  IF partner.wallet IS NULL THEN
    INSERT INTO public.live_costream_queue (wallet, stream_id, username)
    VALUES (w, p_stream_id, left(p_username, 64))
    ON CONFLICT (wallet) DO UPDATE SET stream_id = EXCLUDED.stream_id, username = EXCLUDED.username,
      seen_at = now(), matched_costream_id = NULL,
      joined_at = CASE WHEN live_costream_queue.matched_costream_id IS NULL
        AND live_costream_queue.seen_at > now() - interval '20 seconds'
        THEN live_costream_queue.joined_at ELSE now() END;
    SELECT count(*) INTO waiting FROM public.live_costream_queue q
      WHERE q.matched_costream_id IS NULL AND q.seen_at > now() - interval '20 seconds';
    RETURN jsonb_build_object('status', 'waiting', 'waiting', waiting);
  END IF;

  SELECT c.id INTO room_id FROM public.live_costreams c WHERE c.host_wallet = partner.wallet AND c.status = 'active';
  IF room_id IS NULL THEN
    INSERT INTO public.live_costreams (host_wallet, host_stream_id, host_username, accepting_requests)
    VALUES (partner.wallet, partner.stream_id, partner.username, false)
    RETURNING id INTO room_id;
  END IF;

  INSERT INTO public.live_costream_guests (costream_id, wallet, stream_id, username, status)
  VALUES (room_id, w, p_stream_id, left(p_username, 64), 'accepted')
  ON CONFLICT (costream_id, wallet) DO UPDATE SET status = 'accepted', stream_id = EXCLUDED.stream_id,
    username = EXCLUDED.username, muted = false;

  UPDATE public.live_costream_queue SET matched_costream_id = room_id WHERE wallet = partner.wallet;
  DELETE FROM public.live_costream_queue WHERE wallet = w;
  RETURN jsonb_build_object('status', 'matched', 'role', 'guest', 'costream_id', room_id,
    'partner_wallet', partner.wallet, 'partner_username', partner.username);
END $$;

CREATE OR REPLACE FUNCTION public.costream_queue_poll()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w text := nullif(public.get_signed_request_wallet_address(), '');
  mine public.live_costream_queue%ROWTYPE;
  waiting integer;
BEGIN
  IF w IS NULL THEN RETURN jsonb_build_object('status', 'idle'); END IF;
  SELECT * INTO mine FROM public.live_costream_queue WHERE wallet = w;
  IF mine.wallet IS NULL THEN RETURN jsonb_build_object('status', 'idle'); END IF;
  IF mine.matched_costream_id IS NOT NULL THEN
    DELETE FROM public.live_costream_queue WHERE wallet = w;
    RETURN jsonb_build_object('status', 'matched', 'role', 'host', 'costream_id', mine.matched_costream_id);
  END IF;
  UPDATE public.live_costream_queue SET seen_at = now() WHERE wallet = w;
  SELECT count(*) INTO waiting FROM public.live_costream_queue q
    WHERE q.matched_costream_id IS NULL AND q.seen_at > now() - interval '20 seconds';
  RETURN jsonb_build_object('status', 'waiting', 'waiting', waiting);
END $$;

CREATE OR REPLACE FUNCTION public.costream_queue_leave()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.live_costream_queue WHERE wallet = nullif(public.get_signed_request_wallet_address(), '');
$$;

-- How many creators are looking right now, for the button label.
CREATE OR REPLACE FUNCTION public.costream_queue_size()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.live_costream_queue q
  WHERE q.matched_costream_id IS NULL AND q.seen_at > now() - interval '20 seconds';
$$;

REVOKE ALL ON FUNCTION public.costream_queue_join(text, text), public.costream_queue_poll(),
  public.costream_queue_leave(), public.costream_queue_size() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.costream_queue_join(text, text), public.costream_queue_poll(),
  public.costream_queue_leave(), public.costream_queue_size() TO anon, authenticated, service_role;
