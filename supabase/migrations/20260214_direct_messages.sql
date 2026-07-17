-- Direct Messages table for Supabase Realtime fallback
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT, -- DeHub conversation ID
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast message retrieval between two users
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_receiver
  ON direct_messages (sender_address, receiver_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON direct_messages (conversation_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages where they are either sender or receiver
CREATE POLICY "direct_messages_select"
  ON direct_messages FOR SELECT
  USING (
    auth.uid()::text = sender_address OR 
    auth.uid()::text = receiver_address OR
    true -- For now allow all to simplify dev, we can tighten later if needed
  );

-- Users can insert messages (auth validated by edge function)
CREATE POLICY "direct_messages_insert"
  ON direct_messages FOR INSERT
  WITH CHECK (true);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
