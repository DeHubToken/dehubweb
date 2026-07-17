-- Tracks which "your request shipped!" popups a user has already been shown,
-- so the Features board can notify authors exactly once per shipped item
-- (including items that were already shipped before this table existed).
CREATE TABLE public.feature_shipped_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, feature_request_id)
);

ALTER TABLE public.feature_shipped_notifications ENABLE ROW LEVEL SECURITY;

-- Reuses public.get_request_wallet_address(), the x-wallet-address-header
-- helper already used for ai_conversations/ai_messages RLS.
CREATE POLICY "Users can view own shipped notifications"
ON public.feature_shipped_notifications
FOR SELECT
USING (
  LOWER(wallet_address) = public.get_request_wallet_address()
);

CREATE POLICY "Users can create own shipped notifications"
ON public.feature_shipped_notifications
FOR INSERT
WITH CHECK (
  LOWER(wallet_address) = public.get_request_wallet_address()
);
