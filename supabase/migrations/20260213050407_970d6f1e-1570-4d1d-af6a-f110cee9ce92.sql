
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

CREATE INDEX IF NOT EXISTS idx_livechat_messages_room_created
  ON livechat_messages (room_id, created_at DESC);

ALTER TABLE livechat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livechat_messages_select"
  ON livechat_messages FOR SELECT
  USING (true);

CREATE POLICY "livechat_messages_insert"
  ON livechat_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "livechat_messages_update"
  ON livechat_messages FOR UPDATE
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE livechat_messages;
