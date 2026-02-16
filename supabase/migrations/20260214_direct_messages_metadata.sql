-- Add metadata columns to direct_messages for efficiency
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_username TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_display_name TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT;

-- Re-enable Realtime for this table (in case it was disabled or needs update)
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
