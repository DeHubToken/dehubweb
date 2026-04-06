
-- Add is_private flag to events
ALTER TABLE public.community_events
ADD COLUMN is_private boolean NOT NULL DEFAULT false;
