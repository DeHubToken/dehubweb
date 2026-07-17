-- Add default_post_visibility column to user_privacy_settings table
ALTER TABLE public.user_privacy_settings 
ADD COLUMN IF NOT EXISTS default_post_visibility text NOT NULL DEFAULT 'public';

-- Add constraint to ensure valid values
ALTER TABLE public.user_privacy_settings 
ADD CONSTRAINT valid_post_visibility CHECK (default_post_visibility IN ('public', 'private'));