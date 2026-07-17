
-- Custom notifications table for platform-specific notifications (feature request likes, etc.)
CREATE TABLE public.custom_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_address TEXT NOT NULL,
  actor_address TEXT NOT NULL,
  actor_username TEXT,
  actor_avatar TEXT,
  type TEXT NOT NULL DEFAULT 'feature_request_like',
  content TEXT NOT NULL DEFAULT '',
  reference_id TEXT,
  reference_title TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by recipient
CREATE INDEX idx_custom_notifications_recipient ON public.custom_notifications(recipient_address, created_at DESC);

-- Enable RLS
ALTER TABLE public.custom_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own custom notifications"
ON public.custom_notifications
FOR SELECT
USING (lower(recipient_address) = get_request_wallet_address());

-- Allow inserts (from triggers/edge functions)
CREATE POLICY "Allow insert custom notifications"
ON public.custom_notifications
FOR INSERT
WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own custom notifications"
ON public.custom_notifications
FOR UPDATE
USING (lower(recipient_address) = get_request_wallet_address());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own custom notifications"
ON public.custom_notifications
FOR DELETE
USING (lower(recipient_address) = get_request_wallet_address());

-- Trigger function: create notification when someone likes a feature request
CREATE OR REPLACE FUNCTION public.notify_feature_request_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify on likes (vote_type = 1), not dislikes
  IF NEW.vote_type = 1 THEN
    -- Don't notify yourself
    INSERT INTO public.custom_notifications (
      recipient_address,
      actor_address,
      actor_username,
      type,
      content,
      reference_id,
      reference_title
    )
    SELECT
      fr.author_wallet_address,
      NEW.wallet_address,
      NULL,
      'feature_request_like',
      '',
      fr.id::text,
      fr.title
    FROM public.feature_requests fr
    WHERE fr.id = NEW.feature_request_id
      AND lower(fr.author_wallet_address) != lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to feature_request_votes
CREATE TRIGGER on_feature_request_vote_notify
AFTER INSERT ON public.feature_request_votes
FOR EACH ROW
EXECUTE FUNCTION public.notify_feature_request_vote();
