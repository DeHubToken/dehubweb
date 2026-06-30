CREATE TABLE public.user_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_wallet_address TEXT NOT NULL,
  creator_username TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  trigger_phrases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  system_prompt TEXT NOT NULL,
  asset_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  model TEXT NOT NULL DEFAULT 'google/gemini-3.1-flash-image',
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image','chat')),
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_skills_creator_idx ON public.user_skills (creator_wallet_address);
CREATE INDEX user_skills_featured_idx ON public.user_skills (is_featured) WHERE is_featured = true;
CREATE INDEX user_skills_usage_idx ON public.user_skills (usage_count DESC);

GRANT SELECT ON public.user_skills TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_skills TO authenticated;
GRANT ALL ON public.user_skills TO service_role;

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view skills"
  ON public.user_skills FOR SELECT
  USING (true);

CREATE POLICY "Creator can insert skill"
  ON public.user_skills FOR INSERT
  WITH CHECK (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Creator can update own skill"
  ON public.user_skills FOR UPDATE
  USING (lower(creator_wallet_address) = public.get_request_wallet_address())
  WITH CHECK (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Creator can delete own skill"
  ON public.user_skills FOR DELETE
  USING (lower(creator_wallet_address) = public.get_request_wallet_address());

CREATE TRIGGER user_skills_updated_at
  BEFORE UPDATE ON public.user_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.increment_user_skill_usage(p_skill_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_skills SET usage_count = usage_count + 1 WHERE id = p_skill_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_user_skill_usage(UUID) TO anon, authenticated;

INSERT INTO public.user_skills (
  creator_wallet_address, creator_username, name, slug, description,
  trigger_phrases, system_prompt, asset_urls, kind, is_featured
) VALUES (
  '0x0000000000000000000000000000000000000000',
  'dehub',
  'DeHub Poster',
  'dehub-poster',
  'Generate DeHub-branded posters, social cards, and announcements using the official white wordmark and the brand''s liquid-glass dark aesthetic.',
  ARRAY['dehub poster','dehub image','dehub social','dehub card','dehub banner','dehub announcement','make me a dehub'],
  E'You are generating a DeHub-branded image. Brand rules:\n- Deep black / charcoal background (#000–#0a0a0a). Never use blue.\n- Liquid-glass, cinematic, premium aesthetic. Lots of negative space.\n- Place the official DeHub white wordmark logo cleanly, with breathing room, pure white, unaltered.\n- Subtle ambient glow only (violet/magenta/cyan allowed as lighting, never on the logo).\n- Minimal text, thin sans-serif, white. No emoji. No purple-on-white AI clichés.\nUse the provided reference image as the logo source — keep it crisp.',
  ARRAY[]::TEXT[],
  'image',
  true
);