-- Stage write policies: stop "anyone with the publishable key can rewrite any
-- stage".
--
-- Measured on production before this migration, every write policy on the
-- stage tables was a pass-through:
--
--   audio_spaces          INSERT  WITH CHECK (true)
--                         UPDATE  USING (true)
--   space_participants    INSERT  WITH CHECK (true)
--                         UPDATE  USING (true)
--                         DELETE  USING (true)
--   raise_hand_requests   INSERT  WITH CHECK (true)
--                         UPDATE  USING (true)
--
-- So any anonymous caller could insert a stage claiming any host, retitle
-- somebody else's room, point its recording_url anywhere, mark it ended
-- mid-broadcast, mute a speaker, or approve themselves onto the stage. Only
-- DELETE on audio_spaces was gated. The policy names always said "Host can
-- update their space"; the quals never did.
--
-- ── Why this is not simply "add the wallet check" ──
--
-- Both clients recount a room's headcounts on join and leave, and a LISTENER
-- has to be able to write them — they are the one arriving. Gating
-- audio_spaces UPDATE on the host alone would have taken every join and leave
-- down with it. recount_space() below is the way out: a SECURITY DEFINER
-- function that can write exactly those two columns and nothing else, so the
-- table's UPDATE policy can be host-only without breaking the count.
--
-- ── Do not apply this before both clients ship ──
--
-- get_request_wallet_address() reads the x-wallet-address request header. A
-- client that does not send it fails EVERY write here, silently, and Stages
-- stops working for that user entirely. dehubweb ships on merge, but the phone
-- app ships through the stores and users update on their own schedule, so
-- applying this the moment it lands would break Stages for every installed
-- build. Apply it once the release carrying the matching client is out and
-- adopted.
--
-- Note the ceiling this buys, so it is not mistaken for more than it is:
-- get_request_wallet_address() reads an UNSIGNED header, so this is
-- honest-client enforcement — it stops casual and accidental writes, not a
-- determined forger. Real enforcement needs the writes behind an edge function
-- that verifies a DeHub token, the way agora-token now gates publisher tokens.

-- ── Headcounts, writable by whoever is in the room ────────────────────────────

/**
 * Recount a stage's headcounts from its participant rows.
 *
 * SECURITY DEFINER so a listener joining or leaving can keep the numbers
 * honest without holding UPDATE on audio_spaces generally. It touches only
 * listener_count and speaker_count, and it derives both — there is no caller-
 * supplied number to lie with, which is also why it needs no wallet check of
 * its own.
 *
 * Recounting rather than incrementing is deliberate: a counter drifts on every
 * rejoin (the participant upsert collides, so no row is added but a +1 still
 * lands) and on every crash-out, and it never converges again. A number
 * derived from the rows is self-healing.
 */
CREATE OR REPLACE FUNCTION public.recount_space(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.audio_spaces s
  SET listener_count = (
        SELECT count(*) FROM public.space_participants p
        WHERE p.space_id = s.id AND p.role = 'listener' AND p.left_at IS NULL
      ),
      speaker_count = (
        SELECT count(*) FROM public.space_participants p
        WHERE p.space_id = s.id AND p.role IN ('host', 'speaker') AND p.left_at IS NULL
      )
  WHERE s.id = p_space_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recount_space(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recount_space(uuid) TO anon, authenticated;

-- ── audio_spaces ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can create spaces" ON public.audio_spaces;
CREATE POLICY "Host can create their own space"
  ON public.audio_spaces FOR INSERT
  WITH CHECK (lower(host_wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Host can update their space" ON public.audio_spaces;
CREATE POLICY "Host can update their space"
  ON public.audio_spaces FOR UPDATE
  USING (lower(host_wallet_address) = get_request_wallet_address())
  WITH CHECK (lower(host_wallet_address) = get_request_wallet_address());

-- ── space_participants ───────────────────────────────────────────────────────
--
-- Two writers, not one: you manage your own seat (join, leave, mute), and the
-- host manages everyone's (approve a raised hand, remove a speaker, invite one
-- up). Anyone else, on any row, is refused.

CREATE OR REPLACE FUNCTION public.is_stage_host(p_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = p_space_id
      AND lower(s.host_wallet_address) = get_request_wallet_address()
  );
$$;

REVOKE ALL ON FUNCTION public.is_stage_host(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_stage_host(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can join as participant" ON public.space_participants;
CREATE POLICY "You can take your own seat"
  ON public.space_participants FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Participants can update their own record" ON public.space_participants;
CREATE POLICY "You or the host can update a seat"
  ON public.space_participants FOR UPDATE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    OR is_stage_host(space_id)
  );

DROP POLICY IF EXISTS "Participants can leave" ON public.space_participants;
CREATE POLICY "You or the host can remove a seat"
  ON public.space_participants FOR DELETE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    OR is_stage_host(space_id)
  );

-- ── raise_hand_requests ──────────────────────────────────────────────────────
--
-- You raise your own hand; the host is the one who answers it.

DROP POLICY IF EXISTS "Anyone can raise hand" ON public.raise_hand_requests;
CREATE POLICY "You can raise your own hand"
  ON public.raise_hand_requests FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Host can update requests" ON public.raise_hand_requests;
CREATE POLICY "You or the host can resolve a request"
  ON public.raise_hand_requests FOR UPDATE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    OR is_stage_host(space_id)
  );

-- ── stage_reminders ──────────────────────────────────────────────────────────
--
-- DELETE was already gated; INSERT was not, so a reminder could be set in
-- anyone's name — which matters more than it looks, because the go-live
-- trigger fans a notification out to every wallet holding one.

DROP POLICY IF EXISTS "Authenticated users can set reminders" ON public.stage_reminders;
CREATE POLICY "You can set your own reminder"
  ON public.stage_reminders FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());
