-- Create event chat messages table
CREATE TABLE public.event_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  badge_balance NUMERIC,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  image_url TEXT,
  reply_to_id UUID REFERENCES public.event_chat_messages(id),
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view event chat messages"
ON public.event_chat_messages FOR SELECT
USING (true);

CREATE POLICY "Users can send event chat messages"
ON public.event_chat_messages FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update own event chat messages"
ON public.event_chat_messages FOR UPDATE
USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete own event chat messages"
ON public.event_chat_messages FOR DELETE
USING (lower(wallet_address) = get_request_wallet_address());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_chat_messages;

-- Add unique constraint on RSVPs for upsert if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_event_rsvps_event_id_wallet_address_key'
  ) THEN
    ALTER TABLE public.community_event_rsvps
    ADD CONSTRAINT community_event_rsvps_event_id_wallet_address_key
    UNIQUE (event_id, wallet_address);
  END IF;
END $$;