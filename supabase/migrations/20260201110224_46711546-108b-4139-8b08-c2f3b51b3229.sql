-- Add hide_follower_counts column to user_privacy_settings
ALTER TABLE public.user_privacy_settings
ADD COLUMN hide_follower_counts boolean NOT NULL DEFAULT false;