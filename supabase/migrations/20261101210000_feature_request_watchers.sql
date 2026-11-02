-- The team hears about everything on the Requests board.
--
-- Until now a new request told nobody, and a comment only told the request's
-- author (plus the parent comment's author for a reply). The board's owners
-- want a bell row for every new request and every comment, so they can answer
-- without refreshing the page. The list of watchers lives in one function so a
-- second account can be added without touching either trigger.
--
-- Two new row types keep the wording honest: a watcher is not the request's
-- author, so "commented on your feature request" would be wrong.
--   feature_request_new       {{name}} posted a new request "{{title}}"
--   feature_request_activity  {{name}} commented on "{{title}}"
--
-- Nobody is told about their own action, and a watcher who is already getting
-- the author or reply row for a comment does not get a second one.

CREATE OR REPLACE FUNCTION public.feature_request_watcher_wallets()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY[
    '0x9324840523a5d17dd12a2f11a9472e5a199c1937' -- maldoteth
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.notify_feature_request_watchers_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.custom_notifications (
    recipient_address, actor_address, actor_username, actor_avatar,
    type, content, reference_id, reference_title
  )
  SELECT
    w.wallet, NEW.author_wallet_address, NEW.author_username, NEW.author_avatar,
    'feature_request_new', LEFT(COALESCE(NEW.description, ''), 100), NEW.id::text, NEW.title
  FROM unnest(public.feature_request_watcher_wallets()) AS w(wallet)
  WHERE lower(w.wallet) != lower(NEW.author_wallet_address);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A bell row must never stop someone posting a request.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_feature_request_watchers_new ON public.feature_requests;
CREATE TRIGGER on_feature_request_watchers_new
  AFTER INSERT ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_feature_request_watchers_new();

CREATE OR REPLACE FUNCTION public.notify_feature_request_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  request_author text;
  parent_author text;
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

  -- ...and the board's watchers, skipping anyone the rows above already told.
  SELECT lower(fr.author_wallet_address) INTO request_author
  FROM public.feature_requests fr WHERE fr.id = NEW.feature_request_id;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT lower(parent.wallet_address) INTO parent_author
    FROM public.feature_request_comments parent WHERE parent.id = NEW.parent_id;
  END IF;

  BEGIN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, actor_username, actor_avatar,
      type, content, reference_id, reference_title, reference_comment_id
    )
    SELECT
      w.wallet, NEW.wallet_address, NEW.username, NEW.avatar,
      'feature_request_activity', LEFT(NEW.content, 100), fr.id::text, fr.title, NEW.id::text
    FROM unnest(public.feature_request_watcher_wallets()) AS w(wallet)
    JOIN public.feature_requests fr ON fr.id = NEW.feature_request_id
    WHERE lower(w.wallet) != lower(NEW.wallet_address)
      AND lower(w.wallet) IS DISTINCT FROM request_author
      AND lower(w.wallet) IS DISTINCT FROM parent_author;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
