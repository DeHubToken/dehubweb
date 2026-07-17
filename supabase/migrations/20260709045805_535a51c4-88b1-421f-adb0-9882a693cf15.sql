
CREATE TABLE public.user_display_preferences (
  wallet_address TEXT PRIMARY KEY,
  shorts_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_display_preferences TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_display_preferences TO authenticated;
GRANT ALL ON public.user_display_preferences TO service_role;

ALTER TABLE public.user_display_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view display preferences"
ON public.user_display_preferences
FOR SELECT
USING (true);

CREATE POLICY "Users can insert own display preferences"
ON public.user_display_preferences
FOR INSERT
WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Users can update own display preferences"
ON public.user_display_preferences
FOR UPDATE
USING (lower(wallet_address) = public.get_request_wallet_address())
WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

CREATE TRIGGER update_user_display_preferences_updated_at
BEFORE UPDATE ON public.user_display_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
