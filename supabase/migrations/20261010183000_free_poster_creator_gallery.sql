-- Public discovery contains only server-recorded, free DeHub Poster renders.
-- Historical chat attachments have no reliable provenance and are not backfilled.
CREATE TABLE public.creator_public_posters (
  id uuid PRIMARY KEY,
  image_url text NOT NULL CHECK (image_url LIKE 'https://%/storage/v1/object/public/creator-public-posters/%.png'),
  skill_slug text NOT NULL DEFAULT 'dehub-poster' CHECK (skill_slug = 'dehub-poster'),
  price_dhb numeric NOT NULL DEFAULT 0 CHECK (price_dhb = 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_public_posters_created_at_idx ON public.creator_public_posters (created_at DESC);
ALTER TABLE public.creator_public_posters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_public_posters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.creator_public_posters TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('creator-public-posters', 'creator-public-posters', true, 10485760, ARRAY['image/png']);
-- No client upload policies: only the trusted generation function can publish.

CREATE OR REPLACE FUNCTION public.get_creator_gallery(p_limit integer DEFAULT 60)
RETURNS TABLE(id uuid, image_url text, video_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.image_url, NULL::text AS video_url, p.created_at
  FROM public.creator_public_posters p
  WHERE p.skill_slug = 'dehub-poster' AND p.price_dhb = 0
  ORDER BY p.created_at DESC, p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 120);
$function$;
REVOKE ALL ON FUNCTION public.get_creator_gallery(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_gallery(integer) TO anon, authenticated, service_role;
