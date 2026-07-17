-- Create audio_spaces table for managing live audio rooms
CREATE TABLE public.audio_spaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  host_wallet_address TEXT NOT NULL,
  host_username TEXT,
  host_avatar TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  listener_count INTEGER NOT NULL DEFAULT 0,
  speaker_count INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create space_participants table for tracking who's in a space
CREATE TABLE public.space_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.audio_spaces(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'listener' CHECK (role IN ('host', 'speaker', 'listener')),
  is_muted BOOLEAN NOT NULL DEFAULT true,
  hand_raised BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(space_id, wallet_address)
);

-- Create raise_hand_requests table for tracking speaker requests
CREATE TABLE public.raise_hand_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.audio_spaces(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(space_id, wallet_address, status)
);

-- Enable RLS on all tables
ALTER TABLE public.audio_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raise_hand_requests ENABLE ROW LEVEL SECURITY;

-- Audio spaces policies (public read for live spaces, authenticated write)
CREATE POLICY "Anyone can view live audio spaces"
  ON public.audio_spaces FOR SELECT
  USING (status = 'live');

CREATE POLICY "Authenticated users can create spaces"
  ON public.audio_spaces FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Host can update their space"
  ON public.audio_spaces FOR UPDATE
  USING (true);

-- Participants policies
CREATE POLICY "Anyone can view space participants"
  ON public.space_participants FOR SELECT
  USING (true);

CREATE POLICY "Anyone can join as participant"
  ON public.space_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Participants can update their own record"
  ON public.space_participants FOR UPDATE
  USING (true);

CREATE POLICY "Participants can leave"
  ON public.space_participants FOR DELETE
  USING (true);

-- Raise hand requests policies
CREATE POLICY "Anyone can view raise hand requests"
  ON public.raise_hand_requests FOR SELECT
  USING (true);

CREATE POLICY "Anyone can raise hand"
  ON public.raise_hand_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Host can update requests"
  ON public.raise_hand_requests FOR UPDATE
  USING (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.audio_spaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.raise_hand_requests;

-- Create indexes for performance
CREATE INDEX idx_audio_spaces_status ON public.audio_spaces(status);
CREATE INDEX idx_audio_spaces_host ON public.audio_spaces(host_wallet_address);
CREATE INDEX idx_space_participants_space ON public.space_participants(space_id);
CREATE INDEX idx_space_participants_wallet ON public.space_participants(wallet_address);
CREATE INDEX idx_raise_hand_space ON public.raise_hand_requests(space_id);
CREATE INDEX idx_raise_hand_status ON public.raise_hand_requests(status);