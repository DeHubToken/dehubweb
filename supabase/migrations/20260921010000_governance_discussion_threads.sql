-- APPLIED 2026-09-21
--
-- Governance comments become a discussion rather than a flat guestbook:
-- replies hang off parent_id, your own row can be edited, and the nine-reaction
-- ladder posts and feature requests use works here too. Same shape as
-- 20260907230000_feature_request_comment_threads.sql.
--
-- The proposal's author keeps hearing about every comment. The author of a
-- comment that was replied to now hears about the reply (`governance_reply`),
-- and both rows carry the comment they are about so the bell can open on it.
--
-- Policies go through DO blocks: Postgres has no CREATE POLICY IF NOT EXISTS,
-- and the tool this was applied with refuses DROP POLICY.

ALTER TABLE public.governance_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.governance_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_governance_comments_thread
  ON public.governance_comments(proposal_id, parent_id, created_at);

-- There was no UPDATE policy at all, so editing a comment was impossible
-- rather than merely absent from the UI.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'governance_comments'
      AND policyname = 'Users can update own governance comments'
  ) THEN
    CREATE POLICY "Users can update own governance comments"
      ON public.governance_comments FOR UPDATE
      USING (lower(wallet_address) = get_request_wallet_address())
      WITH CHECK (lower(wallet_address) = get_request_wallet_address());
  END IF;
END
$do$;

-- One row per viewer per comment: the unique key is what makes a second tap a
-- change of reaction rather than a second vote.
CREATE TABLE IF NOT EXISTS public.governance_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.governance_comments(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_gc_reactions_comment
  ON public.governance_comment_reactions(comment_id);

ALTER TABLE public.governance_comment_reactions ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'governance_comment_reactions' AND policyname = 'Anyone can view governance comment reactions'
  ) THEN
    CREATE POLICY "Anyone can view governance comment reactions"
      ON public.governance_comment_reactions FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'governance_comment_reactions' AND policyname = 'Users can cast own governance comment reactions'
  ) THEN
    CREATE POLICY "Users can cast own governance comment reactions"
      ON public.governance_comment_reactions FOR INSERT
      WITH CHECK (lower(wallet_address) = get_request_wallet_address());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'governance_comment_reactions' AND policyname = 'Users can change own governance comment reactions'
  ) THEN
    CREATE POLICY "Users can change own governance comment reactions"
      ON public.governance_comment_reactions FOR UPDATE
      USING (lower(wallet_address) = get_request_wallet_address())
      WITH CHECK (lower(wallet_address) = get_request_wallet_address());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'governance_comment_reactions' AND policyname = 'Users can clear own governance comment reactions'
  ) THEN
    CREATE POLICY "Users can clear own governance comment reactions"
      ON public.governance_comment_reactions FOR DELETE
      USING (lower(wallet_address) = get_request_wallet_address());
  END IF;
END
$do$;

-- The existing trigger (on_governance_comment_notify, AFTER INSERT) keeps
-- calling this; replacing the body is enough, so no second trigger is made.
CREATE OR REPLACE FUNCTION public.notify_governance_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- The proposal's author hears about every comment on it, replies included.
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, actor_username, actor_avatar,
    type, content, reference_id, reference_title, reference_comment_id
  )
  SELECT
    gp.author_wallet_address, NEW.wallet_address, NEW.username, NEW.avatar,
    'governance_comment', LEFT(NEW.content, 100), gp.id::text, gp.title, NEW.id::text
  FROM public.governance_proposals gp
  WHERE gp.id = NEW.proposal_id
    AND lower(gp.author_wallet_address) != lower(NEW.wallet_address);

  -- ...and the author of the comment being replied to, unless that is the same
  -- person the row above already told, or the replier themselves.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, actor_username, actor_avatar,
      type, content, reference_id, reference_title, reference_comment_id
    )
    SELECT
      parent.wallet_address, NEW.wallet_address, NEW.username, NEW.avatar,
      'governance_reply', LEFT(NEW.content, 100), gp.id::text, gp.title, NEW.id::text
    FROM public.governance_comments parent
    JOIN public.governance_proposals gp ON gp.id = parent.proposal_id
    WHERE parent.id = NEW.parent_id
      AND lower(parent.wallet_address) != lower(NEW.wallet_address)
      AND lower(parent.wallet_address) != lower(gp.author_wallet_address);
  END IF;

  RETURN NEW;
END;
$fn$;
