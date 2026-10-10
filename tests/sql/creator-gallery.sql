DO $$ BEGIN
  IF has_table_privilege('anon', 'public.creator_public_posters', 'INSERT')
    OR has_table_privilege('authenticated', 'public.creator_public_posters', 'INSERT') THEN
    RAISE EXCEPTION 'Clients must not publish gallery entries';
  END IF;
END $$;
INSERT INTO public.ai_messages VALUES (gen_random_uuid(), 'assistant', 'https://example.com/private.png', NULL, now());
INSERT INTO public.creator_public_posters (id, image_url)
VALUES ('11111111-1111-4111-8111-111111111111', 'https://example.com/storage/v1/object/public/creator-public-posters/free.png');
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_creator_gallery(90)) <> 1 THEN
    RAISE EXCEPTION 'Public gallery must include only proven free posters';
  END IF;
  IF EXISTS (SELECT FROM public.get_creator_gallery(90) WHERE video_url IS NOT NULL OR image_url LIKE '%private%') THEN
    RAISE EXCEPTION 'Private generation leaked';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.creator_public_posters (id, image_url, price_dhb)
    VALUES (gen_random_uuid(), 'https://example.com/storage/v1/object/public/creator-public-posters/paid.png', 25);
    RAISE EXCEPTION 'Paid generation accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.ai_messages) <> 1 THEN
    RAISE EXCEPTION 'Personal history was modified';
  END IF;
END $$;
