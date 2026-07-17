-- LiveChat Messages table for Supabase Realtime
CREATE TABLE IF NOT EXISTS livechat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  sender_username TEXT,
  sender_display_name TEXT,
  sender_avatar_url TEXT,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  image_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast room message queries
CREATE INDEX idx_livechat_messages_room_created
  ON livechat_messages (room_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE livechat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages
CREATE POLICY "livechat_messages_select"
  ON livechat_messages FOR SELECT
  USING (true);

-- Anyone can insert messages (auth validated by edge function)
CREATE POLICY "livechat_messages_insert"
  ON livechat_messages FOR INSERT
  WITH CHECK (true);

-- Anyone can update messages (pin/unpin - moderation validated by edge function)
CREATE POLICY "livechat_messages_update"
  ON livechat_messages FOR UPDATE
  USING (true);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE livechat_messages;
