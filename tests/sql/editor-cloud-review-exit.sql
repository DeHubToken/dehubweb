BEGIN;
SELECT set_config('request.headers','{}',false);
SET ROLE anon;
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1)$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('editor-project-media','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":1000}');
SELECT set_config('cloud.exit_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','title','Review exit fixture','updatedAt',1,
  'settings',jsonb_build_object('width',1920,'height',1080,'fps',30,'background','#000000','aspectPreset','16:9'),
  'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','muted',false,'hidden',false)),
  'clips',jsonb_build_array(jsonb_build_object('id','c','kind','video','trackId','v','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',0,'duration',10,'trimIn',0))),
  'media',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','storagePath','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','name','Source.mp4','kind','video','mimeType','video/mp4','size',1000)))::text,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.exit_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','viewer',0);
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1)$q$,'42501');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1)$q$,'42501');

SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM editor_cloud_members) THEN RAISE EXCEPTION 'Declined invitation remained in reviewer library'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Decline granted source access'; END IF;
END $$;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
DO $$ DECLARE member jsonb:=editor_cloud_review_members('11111111-1111-4111-8111-111111111111')->0; BEGIN
  IF member->>'stateVersion'<>'2' OR member->>'accepted'<>'false' OR member->>'revoked'<>'true' OR member->>'role'<>'viewer' THEN RAISE EXCEPTION 'Decline/retry did not retain one revoked viewer'; END IF;
END $$;
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','viewer',2);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1)$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',3);
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='editor-project-media')<>1 THEN RAISE EXCEPTION 'Accepted reviewer could not read source'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',3)$q$,'40001');
SELECT cloud_test_error($q$DELETE FROM editor_cloud_members WHERE project_id='11111111-1111-4111-8111-111111111111'$q$,'42501');
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',4);
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',4);
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Leaving accepted review retained library/media access'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');

SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','commenter',5);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',6);
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,2.25,'Keep this feedback after I leave','c');
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',7);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM editor_cloud_comments) THEN RAISE EXCEPTION 'Former commenter retained feedback access'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000012',1,2.25,'New feedback after leaving','c')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_comments('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111'))<>1 THEN RAISE EXCEPTION 'Leaving erased feedback'; END IF;
  IF editor_cloud_load('11111111-1111-4111-8111-111111111111')->'document' IS DISTINCT FROM current_setting('cloud.exit_document')::jsonb THEN RAISE EXCEPTION 'Leaving changed source project'; END IF;
  IF jsonb_array_length(editor_cloud_history('11111111-1111-4111-8111-111111111111'))<>1 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='editor-project-media')<>1 THEN RAISE EXCEPTION 'Leaving changed owner history or source media'; END IF;
END $$;
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','commenter',8);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',7)$q$,'40001');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_inbox())<>1 OR editor_cloud_review_inbox()->0->>'accepted'<>'false' THEN RAISE EXCEPTION 'Stale leave revoked a fresh invitation'; END IF;
END $$;
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',9);
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',10);
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,1,false);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Restoring Trash regranted departed reviewer access'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',NULL)$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_leave(NULL,'11111111-1111-4111-8111-111111111111',11)$q$,'P0001');
RESET ROLE;
ROLLBACK;
SELECT 'Recipient-only decline/leave, idempotent retries, stale-reinvite protection, media revocation, feedback/source retention and Trash restoration passed' AS result;
