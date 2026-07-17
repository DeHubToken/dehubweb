ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_username TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_display_name TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT;