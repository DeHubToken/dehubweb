-- WebRTC voice/video signaling for DeHub DMs (ported from holder-chat)
-- Uses wallet addresses as identities; clients use the anon key.

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_address text NOT NULL,
  recipient_address text NOT NULL,
  call_type text NOT NULL CHECK (call_type IN ('audio', 'video')),
  status text NOT NULL CHECK (status IN ('ringing', 'connected', 'ended')),
  signaling_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_sessions_recipient_ringing_idx
  ON public.call_sessions (recipient_address, status, created_at DESC);

CREATE INDEX IF NOT EXISTS call_sessions_caller_idx
  ON public.call_sessions (caller_address, created_at DESC);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_sessions_select_anon"
  ON public.call_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "call_sessions_insert_anon"
  ON public.call_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "call_sessions_update_anon"
  ON public.call_sessions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Optional callback requests when callee is offline
CREATE TABLE IF NOT EXISTS public.callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_address text NOT NULL,
  recipient_address text NOT NULL,
  call_type text NOT NULL CHECK (call_type IN ('audio', 'video')),
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS callback_requests_recipient_idx
  ON public.callback_requests (recipient_address, status, expires_at DESC);

ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "callback_requests_select_anon"
  ON public.callback_requests FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "callback_requests_insert_anon"
  ON public.callback_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "callback_requests_update_anon"
  ON public.callback_requests FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);