-- feature_shipped_notifications
CREATE TABLE public.feature_shipped_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, feature_request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_shipped_notifications TO authenticated;
GRANT SELECT, INSERT ON public.feature_shipped_notifications TO anon;
GRANT ALL ON public.feature_shipped_notifications TO service_role;

ALTER TABLE public.feature_shipped_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipped notifications"
ON public.feature_shipped_notifications FOR SELECT
USING (LOWER(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Users can create own shipped notifications"
ON public.feature_shipped_notifications FOR INSERT
WITH CHECK (LOWER(wallet_address) = public.get_request_wallet_address());

-- user_preferences_blob
ALTER TABLE public.user_display_preferences
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;