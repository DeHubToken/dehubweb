BEGIN;
SET ROLE anon;
SELECT set_config('request.headers','{}',false);
SELECT cloud_test_error('SELECT editor_cloud_wallet()','42501');
SELECT set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',false);
SELECT cloud_test_error('SELECT editor_cloud_wallet()','42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111',extract(epoch FROM now())::bigint-10);
SELECT cloud_test_error('SELECT editor_cloud_wallet()','42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT set_config('request.headers',(current_setting('request.headers')::jsonb||'{"x-wallet-address":"0x2222222222222222222222222222222222222222"}')::text,false);
SELECT cloud_test_error('SELECT editor_cloud_wallet()','42501');
SELECT set_config('request.headers','{}',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='public-fixture')<>1 THEN RAISE EXCEPTION 'Unrelated public bucket regressed'; END IF;
END $$;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000,'mp4');
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2000,'mp4')$q$,'P0001');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":1000}');
SELECT cloud_test_error($q$INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4','{"size":1000}')$q$,'P0001');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='editor-project-media' AND public) THEN RAISE EXCEPTION 'Project bucket is public'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN UPDATE storage.objects SET metadata='{"size":999}' WHERE bucket_id='editor-project-media'; RAISE EXCEPTION 'Immutable update succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Cloud project media is immutable' THEN RAISE; END IF; END;
END $$;

SELECT set_config('cloud.test_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','title','First edit','updatedAt',1,
  'settings',jsonb_build_object('width',1920,'height',1080,'fps',30,'background','#000000','aspectPreset','16:9'),
  'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','muted',false,'hidden',false)),
  'clips',jsonb_build_array(jsonb_build_object('id','c','kind','video','trackId','v','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',0,'duration',5,'trimIn',1))),
  'media',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','storagePath','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','name','Source.mp4','kind','video','mimeType','video/mp4','size',1000)))::text,false);
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
-- A timed-out response may be retried, but cannot add another version.
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
DO $$ BEGIN IF jsonb_array_length(editor_cloud_history('11111111-1111-4111-8111-111111111111'))<>1 THEN RAISE EXCEPTION 'Retry created a version'; END IF; END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',jsonb_set(current_setting('cloud.test_document')::jsonb,'{snapshot,title}','"Changed"'),0,'00000000-0000-4000-8000-000000000002')$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',jsonb_set(current_setting('cloud.test_document')::jsonb,'{snapshot,title}','"Changed"'),1,'00000000-0000-4000-8000-000000000001')$q$,'P0001');
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',jsonb_set(current_setting('cloud.test_document')::jsonb,'{snapshot,title}','"Second edit"'),1,'00000000-0000-4000-8000-000000000002');
SELECT editor_cloud_restore('11111111-1111-4111-8111-111111111111',1,2,'00000000-0000-4000-8000-000000000003');
DO $$ DECLARE p jsonb; BEGIN
  p:=editor_cloud_load('11111111-1111-4111-8111-111111111111');
  IF p->>'revision'<>'3' OR p->'document'->'snapshot'->>'title'<>'First edit' OR jsonb_array_length(editor_cloud_history('11111111-1111-4111-8111-111111111111'))<>3 THEN RAISE EXCEPTION 'Restore destroyed history'; END IF;
END $$;
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF editor_cloud_list()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM public.editor_cloud_projects) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Foreign account could read projects/media'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_load('11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,0,'00000000-0000-4000-8000-000000000004')$q$,'P0001');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT cloud_test_error($q$INSERT INTO public.editor_cloud_projects(wallet_address,id,title) VALUES('0x1111111111111111111111111111111111111111','22222222-2222-4222-8222-222222222222','Bypass')$q$,'42501');
RESET ROLE;
ROLLBACK;
SELECT 'Signed ownership, independent bucket policy, immutable media, retries, conflicts, restore and account isolation passed' AS result;
