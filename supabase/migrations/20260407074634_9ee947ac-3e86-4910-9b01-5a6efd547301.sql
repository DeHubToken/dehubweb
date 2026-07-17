CREATE TABLE public.post_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  title_text TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  selected_category TEXT NOT NULL DEFAULT '',
  has_image BOOLEAN NOT NULL DEFAULT false,
  has_video BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own drafts"
ON public.post_drafts FOR SELECT
USING (wallet_address = current_setting('request.headers', true)::json->>'x-wallet-address');

CREATE POLICY "Users can create their own drafts"
ON public.post_drafts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own drafts"
ON public.post_drafts FOR UPDATE
USING (wallet_address = current_setting('request.headers', true)::json->>'x-wallet-address');

CREATE POLICY "Users can delete their own drafts"
ON public.post_drafts FOR DELETE
USING (wallet_address = current_setting('request.headers', true)::json->>'x-wallet-address');

CREATE INDEX idx_post_drafts_wallet ON public.post_drafts (wallet_address);