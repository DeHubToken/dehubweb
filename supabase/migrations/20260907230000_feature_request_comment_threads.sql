-- APPLIED 2026-09-07
--
-- Feature-request comments become a thread rather than a flat guestbook:
-- replies hang off parent_id, your own row can be edited, and the nine-reaction
-- ladder posts use works here too.
--
-- The notification side gets two new types. A reply tells the comment's author
-- (the trigger has the parent row, so it needs no profile lookup); a mention
-- tells whoever was named, and that one is written by the CLIENT — Postgres
-- holds no profile table, so a trigger has an @handle and no way to turn it
-- into an address. Same split as community_here and stage_live.

ALTER TABLE public.feature_request_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.feature_request_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_feature_request_comments_parent
  ON public.feature_request_comments(parent_id);

-- There was no UPDATE policy at all, so editing a comment was impossible
-- rather than merely absent from the UI.
DROP POLICY IF EXISTS "Users can update their own comments" ON public.feature_request_comments;
CREATE POLICY "Users can update their own comments"
  ON public.feature_request_comments FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- One row per viewer per comment: the unique key is what makes a second tap a
-- change of reaction rather than a second vote.
CREATE TABLE IF NOT EXISTS public.feature_request_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.feature_request_comments(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_frc_reactions_comment
  ON public.feature_request_comment_reactions(comment_id);

ALTER TABLE public.feature_request_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view comment reactions" ON public.feature_request_comment_reactions;
CREATE POLICY "Anyone can view comment reactions"
  ON public.feature_request_comment_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can cast their own comment reactions" ON public.feature_request_comment_reactions;
CREATE POLICY "Users can cast their own comment reactions"
  ON public.feature_request_comment_reactions FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Users can change their own comment reactions" ON public.feature_request_comment_reactions;
CREATE POLICY "Users can change their own comment reactions"
  ON public.feature_request_comment_reactions FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Users can clear their own comment reactions" ON public.feature_request_comment_reactions;
CREATE POLICY "Users can clear their own comment reactions"
  ON public.feature_request_comment_reactions FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Which comment a notification is about. reference_id already holds the request;
-- this is what lets the bell row open on the comment instead of the top of the
-- thread, the same as ?comment= does on a post.
ALTER TABLE public.custom_notifications
  ADD COLUMN IF NOT EXISTS reference_comment_id text;

CREATE OR REPLACE FUNCTION public.notify_feature_request_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- The request's author hears about every comment on it, replies included --
  -- the same as a post author hearing about a reply buried in their thread.
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, actor_username, actor_avatar,
    type, content, reference_id, reference_title, reference_comment_id
  )
  SELECT
    fr.author_wallet_address, NEW.wallet_address, NEW.username, NEW.avatar,
    'feature_request_comment', LEFT(NEW.content, 100), fr.id::text, fr.title, NEW.id::text
  FROM public.feature_requests fr
  WHERE fr.id = NEW.feature_request_id
    AND lower(fr.author_wallet_address) != lower(NEW.wallet_address);

  -- ...and the author of the comment being replied to, unless that is the same
  -- person the row above already told, or the replier themselves.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, actor_username, actor_avatar,
      type, content, reference_id, reference_title, reference_comment_id
    )
    SELECT
      parent.wallet_address, NEW.wallet_address, NEW.username, NEW.avatar,
      'feature_request_reply', LEFT(NEW.content, 100), fr.id::text, fr.title, NEW.id::text
    FROM public.feature_request_comments parent
    JOIN public.feature_requests fr ON fr.id = parent.feature_request_id
    WHERE parent.id = NEW.parent_id
      AND lower(parent.wallet_address) != lower(NEW.wallet_address)
      AND lower(parent.wallet_address) != lower(fr.author_wallet_address);
  END IF;

  RETURN NEW;
END;
$$;
