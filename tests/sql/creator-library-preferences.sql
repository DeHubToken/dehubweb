BEGIN;
INSERT INTO public.creator_assets(id,wallet_address,ready,storage_path,metadata)
VALUES ('library-test-one','owner',true,'owner/retained','{}'), ('library-test-two','outsider',true,'outsider/retained','{}');
UPDATE public.creator_assets SET favorite=true,hidden=true WHERE wallet_address='owner' AND ready=true AND id IN ('library-test-one','library-test-two');
DO $$ BEGIN
  IF NOT (SELECT favorite AND hidden AND ready AND storage_path='owner/retained' FROM public.creator_assets WHERE id='library-test-one') THEN RAISE EXCEPTION 'Hidden media was not retained'; END IF;
  IF (SELECT favorite OR hidden FROM public.creator_assets WHERE id='library-test-two') THEN RAISE EXCEPTION 'Other owner was changed'; END IF;
END $$;
UPDATE public.creator_assets SET hidden=false WHERE wallet_address='owner' AND id='library-test-one';
DO $$ BEGIN
  IF NOT (SELECT favorite AND NOT hidden AND ready AND storage_path='owner/retained' FROM public.creator_assets WHERE id='library-test-one') THEN RAISE EXCEPTION 'Restore changed bytes or favorite'; END IF;
  IF has_table_privilege('anon','public.creator_assets','SELECT') OR has_table_privilege('authenticated','public.creator_assets','SELECT') THEN RAISE EXCEPTION 'Private asset table exposed'; END IF;
END $$;
ROLLBACK;
