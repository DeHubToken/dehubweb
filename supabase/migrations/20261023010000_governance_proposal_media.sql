-- Governance proposals can carry one image or video.
--
-- The file lives in the public `feature-media` bucket under the author's
-- wallet; only `governance-proposal` writes these columns, and it checks the
-- URL points there before it does. The update guard is extended so neither
-- can be swapped after people have voted on what they saw.

ALTER TABLE public.governance_proposals
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_proposals_media_type_check'
  ) THEN
    ALTER TABLE public.governance_proposals
      ADD CONSTRAINT governance_proposals_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image', 'video'));
  END IF;
END $$;

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
  THEN
    RAISE EXCEPTION 'Only the title and description of a proposal can be edited.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;
