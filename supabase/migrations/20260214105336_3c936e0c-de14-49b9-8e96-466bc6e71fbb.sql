
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_receiver
  ON direct_messages (sender_address, receiver_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON direct_messages (conversation_id, created_at DESC);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "direct_messages_select"
  ON direct_messages FOR SELECT
  USING (true);

CREATE POLICY "direct_messages_insert"
  ON direct_messages FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
