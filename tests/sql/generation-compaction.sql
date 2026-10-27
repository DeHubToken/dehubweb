INSERT INTO public.ai_generation_jobs(id,wallet_address,status,result)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'owner','succeeded',
  jsonb_build_object('libraryId','00000000-0000-4000-8000-'||lpad(n::text,12,'0'),'imageUrl','data:image/png;base64,AAAA')
FROM generate_series(1,3) n;
INSERT INTO public.creator_assets
SELECT id::text,wallet_address,wallet_address||'/'||id||'/original',true FROM public.ai_generation_jobs;
INSERT INTO storage.objects SELECT 'creator-assets',storage_path FROM public.creator_assets WHERE id like '%1';
DO $$
BEGIN
  IF public.compact_saved_generation_images(100) <> 1 THEN RAISE EXCEPTION 'must compact only verified objects'; END IF;
  IF (SELECT count(*) FROM public.ai_generation_jobs WHERE result ? 'imageUrl') <> 2 THEN RAISE EXCEPTION 'lost unarchived output'; END IF;
  IF public.compact_saved_generation_images(100) <> 0 THEN RAISE EXCEPTION 'compaction not idempotent'; END IF;
  IF has_function_privilege('anon','public.compact_saved_generation_images(integer)','execute') THEN RAISE EXCEPTION 'public compaction access'; END IF;
END $$;
