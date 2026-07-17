
CREATE TABLE public.user_characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_wallet_address TEXT NOT NULL,
  creator_username TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reference_image_urls TEXT[] NOT NULL DEFAULT '{}',
  primary_image_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_wallet_address, slug)
);

CREATE INDEX user_characters_creator_idx ON public.user_characters (creator_wallet_address);
CREATE INDEX user_characters_slug_idx ON public.user_characters (slug);
CREATE INDEX user_characters_visibility_idx ON public.user_characters (visibility);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_characters TO authenticated;
GRANT SELECT ON public.user_characters TO anon;
GRANT ALL ON public.user_characters TO service_role;

ALTER TABLE public.user_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public characters readable by all"
  ON public.user_characters FOR SELECT
  USING (visibility = 'public' OR lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Owner can insert characters"
  ON public.user_characters FOR INSERT
  WITH CHECK (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Owner can update characters"
  ON public.user_characters FOR UPDATE
  USING (lower(creator_wallet_address) = public.get_request_wallet_address())
  WITH CHECK (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Owner can delete characters"
  ON public.user_characters FOR DELETE
  USING (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE TRIGGER user_characters_set_updated_at
  BEFORE UPDATE ON public.user_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.increment_user_character_usage(p_character_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_characters SET usage_count = usage_count + 1 WHERE id = p_character_id;
$$;
