
-- Community chat messages table
CREATE TABLE public.community_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  image_url TEXT,
  reply_to_id UUID REFERENCES public.community_chat_messages(id) ON DELETE SET NULL,
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast queries by community
CREATE INDEX idx_community_chat_community_id ON public.community_chat_messages(community_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages (member check done in app)
CREATE POLICY "Anyone can view community chat messages"
  ON public.community_chat_messages FOR SELECT
  USING (true);

-- Only members can insert messages (verified via community_members)
CREATE POLICY "Members can send community chat messages"
  ON public.community_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = community_chat_messages.community_id
        AND lower(wallet_address) = get_request_wallet_address()
        AND status = 'active'
    )
  );

-- Users can delete their own messages
CREATE POLICY "Users can delete own community chat messages"
  ON public.community_chat_messages FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Users can update their own messages (for reactions)
CREATE POLICY "Users can update own community chat messages"
  ON public.community_chat_messages FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Allow members to update reactions on any message
CREATE POLICY "Members can update reactions on community chat"
  ON public.community_chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = community_chat_messages.community_id
        AND lower(wallet_address) = get_request_wallet_address()
        AND status = 'active'
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_chat_messages;
