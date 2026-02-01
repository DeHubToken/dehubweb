-- Create user privacy settings table
CREATE TABLE public.user_privacy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  show_followers_following BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;

-- Users can view anyone's privacy settings (needed to respect others' settings)
CREATE POLICY "Anyone can view privacy settings"
ON public.user_privacy_settings
FOR SELECT
USING (true);

-- Users can create their own privacy settings
CREATE POLICY "Users can create own privacy settings"
ON public.user_privacy_settings
FOR INSERT
WITH CHECK (lower(wallet_address) = get_request_wallet_address());

-- Users can update their own privacy settings
CREATE POLICY "Users can update own privacy settings"
ON public.user_privacy_settings
FOR UPDATE
USING (lower(wallet_address) = get_request_wallet_address());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_privacy_settings_updated_at
BEFORE UPDATE ON public.user_privacy_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();