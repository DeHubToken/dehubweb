
-- Create community_events table
CREATE TABLE public.community_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  creator_wallet_address TEXT NOT NULL,
  creator_username TEXT,
  creator_avatar TEXT,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  going_count INTEGER NOT NULL DEFAULT 0,
  interested_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create community_event_rsvps table
CREATE TABLE public.community_event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, wallet_address)
);

-- Enable RLS
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_event_rsvps ENABLE ROW LEVEL SECURITY;

-- RLS for community_events
CREATE POLICY "Anyone can view events"
  ON public.community_events FOR SELECT
  USING (true);

CREATE POLICY "Users can create events"
  ON public.community_events FOR INSERT
  WITH CHECK (lower(creator_wallet_address) = get_request_wallet_address());

CREATE POLICY "Creators can update their events"
  ON public.community_events FOR UPDATE
  USING (lower(creator_wallet_address) = get_request_wallet_address());

CREATE POLICY "Creators can delete their events"
  ON public.community_events FOR DELETE
  USING (lower(creator_wallet_address) = get_request_wallet_address());

-- RLS for community_event_rsvps
CREATE POLICY "Anyone can view RSVPs"
  ON public.community_event_rsvps FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own RSVP"
  ON public.community_event_rsvps FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can update their own RSVP"
  ON public.community_event_rsvps FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete their own RSVP"
  ON public.community_event_rsvps FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Trigger function to update counts
CREATE OR REPLACE FUNCTION public.update_event_rsvp_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_event_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD.event_id;
  ELSE
    target_event_id := NEW.event_id;
  END IF;

  UPDATE public.community_events
  SET
    going_count = (SELECT COUNT(*) FROM public.community_event_rsvps WHERE event_id = target_event_id AND status = 'going'),
    interested_count = (SELECT COUNT(*) FROM public.community_event_rsvps WHERE event_id = target_event_id AND status = 'interested')
  WHERE id = target_event_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_event_rsvp_counts_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.community_event_rsvps
FOR EACH ROW
EXECUTE FUNCTION public.update_event_rsvp_counts();

-- Index for performance
CREATE INDEX idx_community_events_community_id ON public.community_events(community_id);
CREATE INDEX idx_community_events_starts_at ON public.community_events(starts_at);
CREATE INDEX idx_community_event_rsvps_event_id ON public.community_event_rsvps(event_id);
