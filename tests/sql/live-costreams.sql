-- Co-stream permissions: who can open a room, seat a guest, mute, remove,
-- start a battle, and how the matchmaking queue pairs creators.
\set ON_ERROR_STOP on
\set host '''0x1111111111111111111111111111111111111111'''
\set guest '''0x2222222222222222222222222222222222222222'''
\set other '''0x3333333333333333333333333333333333333333'''

CREATE OR REPLACE FUNCTION pg_temp.expect_error(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ok: % (%)', label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'expected an error: %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text) TO anon;

SET ROLE anon;

-- Nobody can open a room for someone else.
SELECT public.test_wallet(:other);
SELECT pg_temp.expect_error($$INSERT INTO public.live_costreams (host_wallet, host_stream_id) VALUES ('0x1111111111111111111111111111111111111111', 's-host')$$, 'room for another wallet');

SELECT public.test_wallet(:host);
INSERT INTO public.live_costreams (id, host_wallet, host_stream_id, host_username)
VALUES ('00000000-0000-0000-0000-0000000000c1', :host, 's-host', 'host');
-- One open room per host.
SELECT pg_temp.expect_error($$INSERT INTO public.live_costreams (host_wallet, host_stream_id) VALUES ('0x1111111111111111111111111111111111111111', 's-host-2')$$, 'second open room');

-- The host invites; the invitee cannot be pre-accepted.
INSERT INTO public.live_costream_guests (costream_id, wallet, status)
VALUES ('00000000-0000-0000-0000-0000000000c1', :guest, 'invited');
SELECT pg_temp.expect_error($$INSERT INTO public.live_costream_guests (costream_id, wallet, status) VALUES ('00000000-0000-0000-0000-0000000000c1', '0x3333333333333333333333333333333333333333', 'accepted')$$, 'seat starting accepted');
-- The host cannot accept on the guest's behalf.
SELECT pg_temp.expect_error($$UPDATE public.live_costream_guests SET status = 'accepted' WHERE wallet = '0x2222222222222222222222222222222222222222'$$, 'host accepting an invite');

-- A stranger cannot touch the guest's seat.
SELECT public.test_wallet(:other);
UPDATE public.live_costream_guests SET status = 'accepted' WHERE wallet = :guest;
SELECT public.test_wallet(:host);
DO $$ BEGIN
  IF (SELECT status FROM public.live_costream_guests WHERE wallet = '0x2222222222222222222222222222222222222222') <> 'invited' THEN
    RAISE EXCEPTION 'a stranger moved the seat';
  END IF;
END $$;

-- The guest accepts, and cannot unmute themselves once muted.
SELECT public.test_wallet(:guest);
UPDATE public.live_costream_guests SET status = 'accepted', stream_id = 's-guest' WHERE wallet = :guest;
SELECT public.test_wallet(:host);
UPDATE public.live_costream_guests SET muted = true WHERE wallet = :guest;
SELECT public.test_wallet(:guest);
UPDATE public.live_costream_guests SET muted = false WHERE wallet = :guest;
DO $$ BEGIN
  IF NOT (SELECT muted FROM public.live_costream_guests WHERE wallet = '0x2222222222222222222222222222222222222222') THEN
    RAISE EXCEPTION 'a guest unmuted themselves';
  END IF;
END $$;

-- Someone else asks to join; the host accepts the request.
SELECT public.test_wallet(:other);
INSERT INTO public.live_costream_guests (costream_id, wallet, status)
VALUES ('00000000-0000-0000-0000-0000000000c1', :other, 'requested');
SELECT pg_temp.expect_error($$UPDATE public.live_costream_guests SET status = 'accepted' WHERE wallet = '0x3333333333333333333333333333333333333333'$$, 'requester accepting themselves');
SELECT public.test_wallet(:host);
UPDATE public.live_costream_guests SET status = 'accepted' WHERE wallet = :other;

-- Battles: the round runs from now, for 30s to 15m, and only the host starts one.
SELECT pg_temp.expect_error($$UPDATE public.live_costreams SET battle_started_at = now(), battle_ends_at = now() + interval '1 hour'$$, 'battle too long');
UPDATE public.live_costreams SET battle_started_at = now(), battle_ends_at = now() + interval '3 minutes', battle_round = 99;
DO $$ BEGIN
  IF (SELECT battle_round FROM public.live_costreams WHERE id = '00000000-0000-0000-0000-0000000000c1') <> 1 THEN
    RAISE EXCEPTION 'battle_round should count rounds, not take a value';
  END IF;
END $$;
SELECT public.test_wallet(:guest);
UPDATE public.live_costreams SET battle_ends_at = now() + interval '10 minutes';
SELECT public.test_wallet(:host);
DO $$ BEGIN
  IF (SELECT battle_ends_at FROM public.live_costreams WHERE id = '00000000-0000-0000-0000-0000000000c1') > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'a guest changed the battle';
  END IF;
END $$;

-- Remove, then the guest cannot put themselves back on screen.
UPDATE public.live_costream_guests SET status = 'removed' WHERE wallet = :other;
SELECT public.test_wallet(:other);
SELECT pg_temp.expect_error($$UPDATE public.live_costream_guests SET status = 'accepted' WHERE wallet = '0x3333333333333333333333333333333333333333'$$, 'removed guest rejoining');
SELECT pg_temp.expect_error($$UPDATE public.live_costream_guests SET status = 'requested' WHERE wallet = '0x3333333333333333333333333333333333333333'$$, 'removed guest re-requesting');

-- Ending the room is final, and seats freeze with it.
SELECT public.test_wallet(:host);
UPDATE public.live_costreams SET status = 'ended';
SELECT pg_temp.expect_error($$UPDATE public.live_costreams SET status = 'active'$$, 'reopening a room');
SELECT public.test_wallet(:guest);
SELECT pg_temp.expect_error($$UPDATE public.live_costream_guests SET status = 'left' WHERE wallet = '0x2222222222222222222222222222222222222222'$$, 'seat change after the end');

-- The queue is RPC-only.
SELECT pg_temp.expect_error($$SELECT * FROM public.live_costream_queue$$, 'reading the queue');

-- Matchmaking: the first creator waits, the second is seated in their room.
SELECT public.test_wallet(:other);
DO $$ BEGIN
  IF public.costream_queue_join('s-other', 'other') ->> 'status' <> 'waiting' THEN RAISE EXCEPTION 'first in should wait'; END IF;
END $$;
SELECT public.test_wallet(:guest);
DO $$ DECLARE r jsonb := public.costream_queue_join('s-guest', 'guest'); BEGIN
  IF r ->> 'status' <> 'matched' OR r ->> 'role' <> 'guest' THEN RAISE EXCEPTION 'second in should match: %', r; END IF;
END $$;
SELECT public.test_wallet(:other);
DO $$ DECLARE r jsonb := public.costream_queue_poll(); room uuid; BEGIN
  IF r ->> 'status' <> 'matched' OR r ->> 'role' <> 'host' THEN RAISE EXCEPTION 'waiter should learn of the match: %', r; END IF;
  room := (r ->> 'costream_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.live_costreams WHERE id = room AND host_wallet = '0x3333333333333333333333333333333333333333' AND host_stream_id = 's-other') THEN
    RAISE EXCEPTION 'the waiter should host';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_costream_guests WHERE costream_id = room AND wallet = '0x2222222222222222222222222222222222222222' AND status = 'accepted' AND stream_id = 's-guest') THEN
    RAISE EXCEPTION 'the newcomer should be seated with their stream';
  END IF;
  -- The new pair can battle straight away.
  UPDATE public.live_costreams SET battle_started_at = now(), battle_ends_at = now() + interval '3 minutes' WHERE id = room;
END $$;
DO $$ BEGIN
  IF public.costream_queue_poll() ->> 'status' <> 'idle' THEN RAISE EXCEPTION 'a match should leave the queue'; END IF;
  IF public.costream_queue_size() <> 0 THEN RAISE EXCEPTION 'queue should be empty'; END IF;
END $$;

-- Battle scores (20261026100000): a round starts at zero against the seated
-- partner, the host keeps the tally, and nobody else can touch it.
\if :{?with_scores}
SELECT public.test_wallet(:other);
UPDATE public.live_costreams SET battle_host_score = 12.5, battle_guest_score = 40 WHERE host_wallet = :other AND status = 'active';
SELECT public.test_wallet(:guest);
UPDATE public.live_costreams SET battle_guest_score = 9999 WHERE host_wallet = :other AND status = 'active';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.live_costreams WHERE host_wallet = '0x3333333333333333333333333333333333333333'
    AND status = 'active' AND battle_host_score = 12.5 AND battle_guest_score = 40
    AND battle_guest_wallet = '0x2222222222222222222222222222222222222222') THEN
    RAISE EXCEPTION 'battle tally should be the host''s alone, against the seated partner';
  END IF;
END $$;
SELECT public.test_wallet(:other);
UPDATE public.live_costreams SET battle_started_at = now(), battle_ends_at = now() + interval '1 minute' WHERE host_wallet = :other AND status = 'active';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.live_costreams WHERE host_wallet = '0x3333333333333333333333333333333333333333'
    AND status = 'active' AND battle_host_score = 0 AND battle_guest_score = 0 AND battle_round = 2) THEN
    RAISE EXCEPTION 'a new round should start from zero';
  END IF;
END $$;
SELECT pg_temp.expect_error($$UPDATE public.live_costreams SET battle_host_score = -1 WHERE host_wallet = '0x3333333333333333333333333333333333333333'$$, 'negative score');
\endif

RESET ROLE;
SELECT 'live costreams: all checks passed' AS result;
