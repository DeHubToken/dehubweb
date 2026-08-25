-- Governance: make the vote mean something
-- ========================================
-- The board had weighted voting, a proposal fee and a verdict column, and none
-- of the three was enforced. This migration closes that, alongside the two new
-- edge functions (governance-vote, governance-proposal) that become the only
-- way in.
--
-- What was wrong, in the order it is fixed below:
--
--   1. `vote_weight` arrived from the browser, and RLS authenticated writes by
--      comparing wallet_address to the caller's own `x-wallet-address` header —
--      an unsigned string. Any address could be claimed, any vote deleted, and
--      any weight asserted. The write policies go; the edge function derives
--      both identity and weight and writes with the service role.
--   2. The author's UPDATE policy was unrestricted, so a proposal author could
--      set their own `status = 'passed'` — and hand-write like_count, which the
--      tally trigger only recomputes on vote changes, so the edit would stick.
--   3. The 10,000 DHB fee was charged client-side and the insert never checked
--      it. INSERT moves behind the fee-verifying function, and the transfer
--      hash is recorded so one transfer cannot buy two proposals.
--   4. Nothing ever closed a proposal. Every proposal now carries
--      `voting_ends_at`, and a cron pass resolves the expired ones.
--   5. The 2026-03-25 migration recreated the governance triggers under new
--      names without dropping the old ones, so every vote and comment has been
--      firing two notifications and two tallies.

-- ── 1. Votes: no direct writes ────────────────────────────────────────────
-- SELECT stays open — the tally is public and the board reads it directly.

DROP POLICY IF EXISTS "Users can create own governance votes" ON public.governance_votes;
DROP POLICY IF EXISTS "Users can update own governance votes" ON public.governance_votes;
DROP POLICY IF EXISTS "Users can delete own governance votes" ON public.governance_votes;

-- ── 2. Proposals: authors may edit their words, nothing else ──────────────

DROP POLICY IF EXISTS "Users can create governance proposals" ON public.governance_proposals;
DROP POLICY IF EXISTS "Authors can update own proposals" ON public.governance_proposals;
DROP POLICY IF EXISTS "Authors can delete own proposals" ON public.governance_proposals;

CREATE POLICY "Authors can update own proposals"
ON public.governance_proposals FOR UPDATE
USING (lower(author_wallet_address) = get_request_wallet_address());

-- A proposal that has been voted on is a record. Withdrawing it would delete
-- the votes with it (the FK cascades), so deletion is only available while it
-- is still untouched.
CREATE POLICY "Authors can delete unvoted open proposals"
ON public.governance_proposals FOR DELETE
USING (
  lower(author_wallet_address) = get_request_wallet_address()
  AND status = 'open'
  AND NOT EXISTS (SELECT 1 FROM public.governance_votes v WHERE v.proposal_id = governance_proposals.id)
);

ALTER TABLE public.governance_proposals
  ADD COLUMN IF NOT EXISTS voting_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_tx_hash text;

-- Partial: the rows that predate the fee check have no hash and must not
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_proposals_fee_tx
  ON public.governance_proposals(fee_tx_hash)
  WHERE fee_tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_governance_proposals_voting_ends
  ON public.governance_proposals(voting_ends_at)
  WHERE status = 'open';

-- Existing open proposals get a full window from today rather than from their
-- creation date — most are older than seven days and would otherwise all
-- resolve on the first cron pass, off tallies nobody knew were final.
UPDATE public.governance_proposals
SET voting_ends_at = now() + interval '7 days'
WHERE status = 'open' AND voting_ends_at IS NULL;

-- Hold the author's UPDATE path to the two fields it is for.
--
-- RLS cannot restrict columns, so the guard is a trigger. It runs as the
-- caller, which is how it tells the author's PostgREST request (role
-- `anon`/`authenticated`) apart from the edge functions and the cron resolver,
-- which arrive as the service role or as postgres and are left alone.
CREATE OR REPLACE FUNCTION public.guard_governance_proposal_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.like_count IS DISTINCT FROM OLD.like_count
     OR NEW.dislike_count IS DISTINCT FROM OLD.dislike_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.author_wallet_address IS DISTINCT FROM OLD.author_wallet_address
     OR NEW.voting_ends_at IS DISTINCT FROM OLD.voting_ends_at
     OR NEW.fee_tx_hash IS DISTINCT FROM OLD.fee_tx_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only the title and description of a proposal can be edited.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_governance_proposal_update ON public.governance_proposals;
CREATE TRIGGER guard_governance_proposal_update
BEFORE UPDATE ON public.governance_proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_governance_proposal_update();

-- ── 3. Duplicate triggers ─────────────────────────────────────────────────
-- The 2026-03-25 migration recreated all four under `on_*` names but dropped
-- none of the originals, so both copies have been firing.

DROP TRIGGER IF EXISTS trg_notify_governance_vote ON public.governance_votes;
DROP TRIGGER IF EXISTS trg_notify_governance_comment ON public.governance_comments;
DROP TRIGGER IF EXISTS update_governance_vote_count ON public.governance_votes;
DROP TRIGGER IF EXISTS update_governance_comment_count ON public.governance_comments;

-- ── 4. Resolving a proposal ───────────────────────────────────────────────

-- Close every proposal whose window has run out.
--
-- Passes on a weighted majority — like_count and dislike_count are already
-- sums of vote weight, not head counts — provided at least ten distinct
-- wallets voted. The quorum is the point of the rule: without it a single
-- Meglodon holder passes a proposal nobody else saw, and thirteen weighted
-- votes from one wallet is not a decision.
--
-- Returns the number of proposals resolved, so a manual run says what it did.
CREATE OR REPLACE FUNCTION public.resolve_due_governance_proposals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  quorum CONSTANT integer := 10;
  resolved integer;
BEGIN
  WITH due AS (
    SELECT p.id,
           p.like_count > p.dislike_count AS majority,
           (SELECT COUNT(DISTINCT v.wallet_address) FROM public.governance_votes v
             WHERE v.proposal_id = p.id) >= 10 AS has_quorum
    FROM public.governance_proposals p
    WHERE p.status = 'open'
      AND p.voting_ends_at IS NOT NULL
      AND p.voting_ends_at <= now()
  ), updated AS (
    UPDATE public.governance_proposals p
    SET status = CASE WHEN due.majority AND due.has_quorum THEN 'passed' ELSE 'rejected' END
    FROM due
    WHERE p.id = due.id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO resolved FROM updated;

  RETURN resolved;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM anon;
REVOKE ALL ON FUNCTION public.resolve_due_governance_proposals() FROM authenticated;

-- Ten minutes: the window is seven days, so this only decides how long a
-- decided proposal keeps accepting votes, and that should be minutes.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resolve-governance-proposals') THEN
    PERFORM cron.schedule(
      'resolve-governance-proposals',
      '*/10 * * * *',
      $cron$SELECT public.resolve_due_governance_proposals()$cron$
    );
  END IF;
END $do$;
