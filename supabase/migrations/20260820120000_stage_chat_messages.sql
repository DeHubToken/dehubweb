-- Live chat for Stages.
--
-- Fourth twin of tv_chat_messages / event_chat_messages /
-- community_chat_messages: same columns (name chain, badge balance,
-- reply_to_id, reactions) so one panel renders a message identically wherever
-- it is read.
--
-- Why a table and not a broadcast channel: StageReactions rides Supabase
-- broadcast because a floating emoji is worthless a second later. Chat is the
-- opposite — someone arriving ten minutes into a stage needs the conversation
-- so far, and the room's messages are the only thing left to read once the
-- audio has ended. Broadcast keeps nothing.
--
-- And not the socket.io /livechat gateway: that gateway hard-codes one global
-- room and discards the roomId every client sends, so "chat in this stage"
-- would have been chat on the whole platform.
--
-- space_id is a real FK with ON DELETE CASCADE. Stage rows do get deleted (the
-- 2026-08-16 purge took six of them) and the transcript tables were left full
-- of orphans pointing at stages that no longer existed. Chat should not repeat
-- that.

CREATE TABLE IF NOT EXISTS public.stage_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.audio_spaces(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  badge_balance NUMERIC,
  content TEXT NOT NULL DEFAULT ''::text,
  message_type TEXT NOT NULL DEFAULT 'text'::text,
  image_url TEXT,
  reply_to_id UUID REFERENCES public.stage_chat_messages(id) ON DELETE SET NULL,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- The clients cap the composer at 500. This is not that cap — it is the
  -- ceiling on what a caller holding the publishable key can push into a
  -- world-readable table.
  CONSTRAINT stage_chat_messages_content_len CHECK (char_length(content) <= 1000)
);

-- The only read pattern: newest N for one stage.
CREATE INDEX IF NOT EXISTS stage_chat_messages_space_created_idx
  ON public.stage_chat_messages (space_id, created_at DESC);

ALTER TABLE public.stage_chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_chat_messages TO anon, authenticated;

-- ── Host lookup ──────────────────────────────────────────────────────────────
--
-- Deliberately duplicated from 20260819180000_stage_write_policies.sql, byte
-- for byte, rather than depended on: that migration must not be applied until
-- a mobile release carrying the matching client is adopted, so it may sit
-- unapplied for weeks and this one cannot wait behind it. CREATE OR REPLACE
-- with an identical body means whichever lands second is a no-op.

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

-- ── Policies ─────────────────────────────────────────────────────────────────
--
-- SELECT is open, and has to be: a signed-out visitor on an invite link gets a
-- listen-only player, and a room they can hear but not read would be worse
-- than no chat at all. It is also what makes realtime work — the websocket
-- cannot send the x-wallet-address header, so any SELECT policy reading it
-- reports SUBSCRIBED and then emits nothing, forever.

DROP POLICY IF EXISTS "Anyone can view stage chat messages" ON public.stage_chat_messages;
CREATE POLICY "Anyone can view stage chat messages"
  ON public.stage_chat_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can send stage chat messages" ON public.stage_chat_messages;
CREATE POLICY "Users can send stage chat messages"
  ON public.stage_chat_messages FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- The host moderates their own room. Deleting is the whole of it: there is no
-- edit-someone-else path, and a stage is short enough that a ban list would
-- outlive the thing it was protecting.
DROP POLICY IF EXISTS "Author or host can delete a stage chat message" ON public.stage_chat_messages;
CREATE POLICY "Author or host can delete a stage chat message"
  ON public.stage_chat_messages FOR DELETE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    OR is_stage_host(space_id)
  );

-- Reactions have to be writable by anyone signed in, but only the `reactions`
-- column, and RLS cannot restrict to a column. Same shape as tv_chat_messages:
-- the policy stays broad and the trigger below draws the actual line.
DROP POLICY IF EXISTS "Signed in users can update stage chat messages" ON public.stage_chat_messages;
CREATE POLICY "Signed in users can update stage chat messages"
  ON public.stage_chat_messages FOR UPDATE
  USING (get_request_wallet_address() <> '');

CREATE OR REPLACE FUNCTION public.stage_chat_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- The author may change their own row freely (message edits).
  IF lower(OLD.wallet_address) = get_request_wallet_address() THEN
    RETURN NEW;
  END IF;

  -- Everyone else may only add or remove a reaction.
  IF ROW(NEW.id, NEW.space_id, NEW.wallet_address, NEW.username, NEW.display_name,
         NEW.avatar_url, NEW.badge_balance, NEW.content, NEW.message_type,
         NEW.image_url, NEW.reply_to_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.space_id, OLD.wallet_address, OLD.username, OLD.display_name,
         OLD.avatar_url, OLD.badge_balance, OLD.content, OLD.message_type,
         OLD.image_url, OLD.reply_to_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Only reactions may be changed on another user''s message';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS stage_chat_guard_update_trg ON public.stage_chat_messages;
CREATE TRIGGER stage_chat_guard_update_trg
  BEFORE UPDATE ON public.stage_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.stage_chat_guard_update();

-- ── Realtime ─────────────────────────────────────────────────────────────────
--
-- Guarded because ALTER PUBLICATION ... ADD TABLE throws on a table already in
-- it, and this file has to be safe to run twice.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = 'public.stage_chat_messages'::regclass
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_chat_messages;
  END IF;
END
$$;
