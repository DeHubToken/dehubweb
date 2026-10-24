-- Public proposal numbers.
--
-- Proposals were shared as /app/governance/<uuid>. Give every row the same
-- short public handle bounties (job_number) and events (event_number) have,
-- so the share form becomes dehub.io/app/governance/2.
--
-- The uuid stays the primary key and every foreign key still points at it —
-- this column is for URLs only. Old uuid links keep resolving: the SPA looks
-- the row up and swaps the address bar to the number, and the edge worker
-- renders the same card for either shape.
CREATE SEQUENCE IF NOT EXISTS public.governance_proposals_proposal_number_seq;

ALTER TABLE public.governance_proposals
  ADD COLUMN IF NOT EXISTS proposal_number INTEGER NOT NULL
  DEFAULT nextval('public.governance_proposals_proposal_number_seq');

-- Existing rows number in posting order, so the first proposal is /1.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.governance_proposals
)
UPDATE public.governance_proposals p
SET proposal_number = n.rn
FROM numbered n
WHERE p.id = n.id;

-- See 20260825161500_work_jobs_job_number.sql for why is_called varies.
SELECT setval(
  'public.governance_proposals_proposal_number_seq',
  GREATEST(COALESCE((SELECT MAX(proposal_number) FROM public.governance_proposals), 0), 1),
  EXISTS (SELECT 1 FROM public.governance_proposals)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_proposals_proposal_number_unique'
  ) THEN
    ALTER TABLE public.governance_proposals
      ADD CONSTRAINT governance_proposals_proposal_number_unique UNIQUE (proposal_number);
  END IF;
END $$;

-- The number is part of the public address; authors must not be able to
-- repoint it. Same guard as media, extended.
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
     OR NEW.media_url IS DISTINCT FROM OLD.media_url
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.proposal_number IS DISTINCT FROM OLD.proposal_number
  THEN
    RAISE EXCEPTION 'Only the title and description of a proposal can be edited.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;
