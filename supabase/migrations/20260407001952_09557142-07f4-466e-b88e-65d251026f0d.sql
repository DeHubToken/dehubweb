CREATE TABLE public.custom_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  elevenlabs_voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voices"
  ON public.custom_voices FOR SELECT
  USING (lower(wallet_address) = lower(public.get_request_wallet_address()));

CREATE POLICY "Users can insert own voices"
  ON public.custom_voices FOR INSERT
  WITH CHECK (lower(wallet_address) = lower(public.get_request_wallet_address()));

CREATE POLICY "Users can delete own voices"
  ON public.custom_voices FOR DELETE
  USING (lower(wallet_address) = lower(public.get_request_wallet_address()));