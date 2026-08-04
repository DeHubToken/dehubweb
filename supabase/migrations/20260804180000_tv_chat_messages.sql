-- Live chat for TV channel playback.
--
-- Twin of event_chat_messages / community_chat_messages so every chat surface
-- carries the same columns (name chain, badge balance, reply_to_id, reactions)
-- and the clients can share the same rendering.
--
-- channel_id is TEXT, not UUID: TV channel ids come from
-- tv_channels_verified.id (a text primary key) or, when that table is empty,
-- from a hash of the stream URL ("ch-<hash>"). Neither is a uuid, and there is
-- no FK for the same reason — a channel served from the fallback playlist has
-- no row to point at.

CREATE TABLE IF NOT EXISTS public.tv_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  badge_balance NUMERIC,
  content TEXT NOT NULL DEFAULT ''::text,
  message_type TEXT NOT NULL DEFAULT 'text'::text,
  image_url TEXT,
  reply_to_id UUID REFERENCES public.tv_chat_messages(id) ON DELETE SET NULL,
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- The only read pattern: newest N for one channel.
CREATE INDEX IF NOT EXISTS tv_chat_messages_channel_created_idx
  ON public.tv_chat_messages (channel_id, created_at DESC);

ALTER TABLE public.tv_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tv chat messages" ON public.tv_chat_messages;
CREATE POLICY "Anyone can view tv chat messages"
  ON public.tv_chat_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can send tv chat messages" ON public.tv_chat_messages;
CREATE POLICY "Users can send tv chat messages"
  ON public.tv_chat_messages FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

DROP POLICY IF EXISTS "Users can delete own tv chat messages" ON public.tv_chat_messages;
CREATE POLICY "Users can delete own tv chat messages"
  ON public.tv_chat_messages FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Reactions have to be writable by anyone signed in, but only the `reactions`
-- column. Communities scope that to "active member of this community"; TV chat
-- has no membership to scope to, so an equivalent policy here would let any
-- wallet rewrite any message. RLS cannot restrict to a column, so the policy
-- stays broad and the trigger below enforces the boundary.
DROP POLICY IF EXISTS "Users can update own tv chat messages" ON public.tv_chat_messages;
DROP POLICY IF EXISTS "Signed in users can update tv chat messages" ON public.tv_chat_messages;
CREATE POLICY "Signed in users can update tv chat messages"
  ON public.tv_chat_messages FOR UPDATE
  USING (get_request_wallet_address() <> '');

CREATE OR REPLACE FUNCTION public.tv_chat_guard_update()
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
  IF ROW(NEW.id, NEW.channel_id, NEW.wallet_address, NEW.username, NEW.display_name,
         NEW.avatar_url, NEW.badge_balance, NEW.content, NEW.message_type,
         NEW.image_url, NEW.reply_to_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.channel_id, OLD.wallet_address, OLD.username, OLD.display_name,
         OLD.avatar_url, OLD.badge_balance, OLD.content, OLD.message_type,
         OLD.image_url, OLD.reply_to_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Only reactions may be changed on another user''s message';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tv_chat_guard_update_trg ON public.tv_chat_messages;
CREATE TRIGGER tv_chat_guard_update_trg
  BEFORE UPDATE ON public.tv_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tv_chat_guard_update();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_chat_messages;
