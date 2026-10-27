-- Complete the signed-wallet rollout. A public address is never authentication.
UPDATE wallet_auth.config SET enforce = true WHERE id = 1;
CREATE OR REPLACE FUNCTION public.get_request_wallet_address()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_signed_request_wallet_address(); $$;

-- Public media remains readable. Mutations require a verified owner.
DROP POLICY IF EXISTS "Users can upload store media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update store media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete store media" ON storage.objects;
DROP POLICY IF EXISTS "ad-media upload" ON storage.objects;
DROP POLICY IF EXISTS "ad-media update" ON storage.objects;
DROP POLICY IF EXISTS "ad-media delete" ON storage.objects;
CREATE POLICY "Owned commerce media insert" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id IN ('store-media','ad-media')
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND split_part(name, '/', 1) = (SELECT public.get_signed_request_wallet_address()));
CREATE POLICY "Owned commerce media update" ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id IN ('store-media','ad-media')
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND split_part(name, '/', 1) = (SELECT public.get_signed_request_wallet_address()))
WITH CHECK (bucket_id IN ('store-media','ad-media')
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND split_part(name, '/', 1) = (SELECT public.get_signed_request_wallet_address()));
CREATE POLICY "Owned commerce media delete" ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id IN ('store-media','ad-media')
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND split_part(name, '/', 1) = (SELECT public.get_signed_request_wallet_address()));

DROP POLICY IF EXISTS "Anyone can upload ai media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload community media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload feature media" ON storage.objects;
CREATE POLICY "Signed media insert" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id IN ('ai-media-uploads','community-media','feature-media')
  AND (SELECT public.get_signed_request_wallet_address()) <> '');

-- This policy was named service-only but actually applied to PUBLIC.
DROP POLICY IF EXISTS "Allow service role insert on agent-avatars" ON storage.objects;
CREATE POLICY "Service avatar insert" ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'agent-avatars');

DROP POLICY IF EXISTS "Users can upload their own sounds" ON storage.objects;
CREATE POLICY "Signed owner sound insert" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'soundboard-sounds'
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND split_part(name, '/', 1) = (SELECT public.get_signed_request_wallet_address()));

DROP POLICY IF EXISTS "Authenticated upload stage recordings" ON storage.objects;
CREATE POLICY "Signed host recording insert" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'stage-recordings'
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND EXISTS (SELECT 1 FROM public.audio_spaces s WHERE s.id::text = split_part(name, '/', 1)
    AND lower(s.host_wallet_address) = (SELECT public.get_signed_request_wallet_address())));
CREATE POLICY "Signed host recording update" ON storage.objects FOR UPDATE TO anon, authenticated
USING (bucket_id = 'stage-recordings'
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND EXISTS (SELECT 1 FROM public.audio_spaces s WHERE s.id::text = split_part(name, '/', 1)
    AND lower(s.host_wallet_address) = (SELECT public.get_signed_request_wallet_address())))
WITH CHECK (bucket_id = 'stage-recordings'
  AND (SELECT public.get_signed_request_wallet_address()) <> ''
  AND EXISTS (SELECT 1 FROM public.audio_spaces s WHERE s.id::text = split_part(name, '/', 1)
    AND lower(s.host_wallet_address) = (SELECT public.get_signed_request_wallet_address())));

-- Legacy endpoints remain callable only by the identity they record.
DROP POLICY IF EXISTS "Users can create their own stories" ON public.stories;
CREATE POLICY "Users can create their own stories" ON public.stories FOR INSERT TO anon, authenticated
WITH CHECK ((SELECT public.get_signed_request_wallet_address()) <> ''
  AND lower(wallet_address) = (SELECT public.get_signed_request_wallet_address()));
DROP POLICY IF EXISTS "Anyone can record views" ON public.story_views;
CREATE POLICY "Signed story viewer insert" ON public.story_views FOR INSERT TO anon, authenticated
WITH CHECK ((SELECT public.get_signed_request_wallet_address()) <> ''
  AND lower(viewer_wallet_address) = (SELECT public.get_signed_request_wallet_address()));

CREATE OR REPLACE FUNCTION public.increment_user_character_usage(p_character_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.user_characters SET usage_count = usage_count + 1
  WHERE id = p_character_id AND (visibility = 'public' OR lower(creator_wallet_address) = public.get_signed_request_wallet_address())
    AND public.get_signed_request_wallet_address() <> ''; $$;
CREATE OR REPLACE FUNCTION public.increment_user_skill_usage(p_skill_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.user_skills SET usage_count = usage_count + 1
  WHERE id = p_skill_id AND public.get_signed_request_wallet_address() <> ''; $$;
