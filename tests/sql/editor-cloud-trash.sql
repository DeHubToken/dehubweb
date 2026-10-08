BEGIN;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":1000}');
SELECT set_config('cloud.test_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','title','First edit','updatedAt',1,
  'settings',jsonb_build_object('width',1920,'height',1080,'fps',30,'background','#000000','aspectPreset','16:9'),
  'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','muted',false,'hidden',false)),
  'clips',jsonb_build_array(jsonb_build_object('id','c','kind','video','trackId','v','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',0,'duration',5,'trimIn',1))),
  'media',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','storagePath','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','name','Source.mp4','kind','video','mimeType','video/mp4','size',1000)))::text,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true);
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true);
DO $$ BEGIN
  IF editor_cloud_list()<>'[]'::jsonb OR jsonb_array_length(editor_cloud_list_trash())<>1 OR editor_cloud_list_trash()->0->>'stateVersion'<>'1' THEN RAISE EXCEPTION 'Trash visibility or retry failed'; END IF;
  IF (SELECT count(*) FROM public.editor_cloud_revisions)<>1 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='editor-project-media')<>1 THEN RAISE EXCEPTION 'Trash removed history or source media'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_load('11111111-1111-4111-8111-111111111111')$q$,'42501');
DO $$ BEGIN IF editor_cloud_history('11111111-1111-4111-8111-111111111111')<>'[]'::jsonb THEN RAISE EXCEPTION 'Trash leaked into active history'; END IF; END $$;
-- Committed-save recovery remains idempotent, but new writes cannot revive Trash.
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
SELECT cloud_test_error($q$SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,1,'00000000-0000-4000-8000-000000000002')$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_restore('11111111-1111-4111-8111-111111111111',1,1,'00000000-0000-4000-8000-000000000003')$q$,'42501');
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN IF editor_cloud_list_trash()<>'[]'::jsonb THEN RAISE EXCEPTION 'Another account read Trash'; END IF; END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,1,false)$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,1,false);
SELECT cloud_test_error($q$SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true)$q$,'40001');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,2,true);
SELECT cloud_test_error($q$SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true)$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,1,false)$q$,'40001');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,3,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.test_document')::jsonb,1,'00000000-0000-4000-8000-000000000002');
SELECT cloud_test_error($q$SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,4,true)$q$,'40001');
DO $$ DECLARE p jsonb; BEGIN
  p:=editor_cloud_load('11111111-1111-4111-8111-111111111111');
  IF p->>'revision'<>'2' OR p->'document'->'snapshot'->'clips'->0->>'trimIn'<>'1' OR jsonb_array_length(editor_cloud_history('11111111-1111-4111-8111-111111111111'))<>2 OR editor_cloud_list_trash()<>'[]'::jsonb THEN RAISE EXCEPTION 'Recovery changed the timeline or history'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media' AND metadata->>'size'='1000') THEN RAISE EXCEPTION 'Recovery removed immutable media'; END IF;
END $$;
SELECT cloud_test_error($q$UPDATE public.editor_cloud_projects SET trashed_at=NULL$q$,'42501');
SELECT cloud_test_error($q$DELETE FROM public.editor_cloud_projects$q$,'42501');
RESET ROLE;
ROLLBACK;
SELECT 'Recoverable Trash retains versions/media, isolates accounts, retries safely and rejects stale moves or new writes' AS result;
