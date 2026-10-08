BEGIN;
SELECT set_config('request.headers','{}',false);
SET ROLE anon;
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,'mp4');
SELECT editor_cloud_prepare_media('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',20,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('editor-project-media','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":10}'),
 ('editor-project-media','0x1111111111111111111111111111111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4','{"size":20}');
SELECT set_config('cloud.edit_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','title','Shared editor fixture','updatedAt',1,
  'settings',jsonb_build_object('width',1920,'height',1080,'fps',30,'background','#000000','aspectPreset','16:9'),
  'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','muted',false,'hidden',false)),
  'clips',jsonb_build_array(jsonb_build_object('id','c','kind','video','trackId','v','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',0,'duration',10,'trimIn',0))),
  'media',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','storagePath','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','name','Source.mp4','kind','video','mimeType','video/mp4','size',10)))::text,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
SELECT set_config('cloud.other_document',replace(replace(replace(current_setting('cloud.edit_document'),'11111111-1111-4111-8111-111111111111','99999999-1111-4111-8111-111111111111'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'"size": 10','"size": 20'),false);
SELECT editor_cloud_save('99999999-1111-4111-8111-111111111111',current_setting('cloud.other_document')::jsonb,0,'00000000-0000-4000-8000-000000000002');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','editor',0);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,1,'00000000-0000-4000-8000-000000000010')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',30,'mp4')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
DO $$ BEGIN
  IF editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')->>'revision'<>'1' THEN RAISE EXCEPTION 'Accepted editor could not open head'; END IF;
  IF EXISTS(SELECT 1 FROM editor_cloud_projects) OR EXISTS(SELECT 1 FROM editor_cloud_revisions) OR editor_cloud_list()<>'[]'::jsonb THEN RAISE EXCEPTION 'Editor can read owner private rows'; END IF;
END $$;
SELECT cloud_test_error($q$UPDATE editor_cloud_projects SET title='Bypass'$q$,'42501');
SELECT set_config('cloud.changed_document',jsonb_set(current_setting('cloud.edit_document')::jsonb,'{snapshot,title}','"Edited together"')::text,false);
SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.changed_document')::jsonb,1,'00000000-0000-4000-8000-000000000010');
DO $$ BEGIN
  IF editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.changed_document')::jsonb,1,'00000000-0000-4000-8000-000000000010')->>'revision'<>'2' THEN RAISE EXCEPTION 'Retry added a shared revision'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,1,'00000000-0000-4000-8000-000000000010')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,1,'00000000-0000-4000-8000-000000000011')$q$,'40001');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',jsonb_set(current_setting('cloud.other_document')::jsonb,'{snapshot,id}','"11111111-1111-4111-8111-111111111111"'),2,'00000000-0000-4000-8000-000000000012')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','viewer',0);
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','commenter',2);
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,2,'00000000-0000-4000-8000-000000000012')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','editor',3);
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',4);
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',2,2,'Editor feedback','c',NULL,'0x2222222222222222222222222222222222222222');
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',30,'mp4');
SELECT cloud_test_error($q$INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4','{"size":31}')$q$,'P0001');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4','{"size":30}');
SELECT set_config('cloud.new_source_document',replace(replace(current_setting('cloud.changed_document'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'"size": 10','"size": 30'),false);
SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.new_source_document')::jsonb,2,'00000000-0000-4000-8000-000000000014');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
DO $$ BEGIN
  IF editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')->'document' IS DISTINCT FROM current_setting('cloud.new_source_document')::jsonb THEN RAISE EXCEPTION 'Other editor cannot load new shared source'; END IF;
END $$;
SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.edit_document')::jsonb,3,'00000000-0000-4000-8000-000000000015');
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',40,'mp4');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',40,'mp4')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','99999999-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',50,'mp4')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',4,0,true);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.changed_document')::jsonb,4,'00000000-0000-4000-8000-000000000016')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT cloud_test_error($q$INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd/source.mp4','{"size":40}')$q$,'42501');
RESET ROLE;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',4,1,false);
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','none',2);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',current_setting('cloud.changed_document')::jsonb,1,'00000000-0000-4000-8000-000000000010')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',50,'mp4')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT cloud_test_error($q$INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd/source.mp4','{"size":40}')$q$,'42501');
RESET ROLE;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','editor',3);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',4);
DO $$ DECLARE i integer; BEGIN
  FOR i IN 1..9 LOOP
    PERFORM editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',(lpad(i::text,8,'0')||'-9999-4999-8999-999999999999')::uuid,1073741824,'mp4');
  END LOOP;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000010-9999-4999-8999-999999999999',1073741824,'mp4')$q$,'P0001');
RESET ROLE;
SELECT set_config('cloud.revisions_before',coalesce((SELECT jsonb_agg(document ORDER BY revision)::text FROM editor_cloud_revisions WHERE wallet_address='0x1111111111111111111111111111111111111111' AND project_id='11111111-1111-4111-8111-111111111111'),'[]'),false);
SET ROLE service_role;
SELECT erase_editor_account_data('0x2222222222222222222222222222222222222222');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT revision FROM editor_cloud_projects WHERE wallet_address='0x1111111111111111111111111111111111111111' AND id='11111111-1111-4111-8111-111111111111')<>4 THEN RAISE EXCEPTION 'Erasure removed shared project'; END IF;
  IF (SELECT jsonb_agg(document ORDER BY revision)::text FROM editor_cloud_revisions WHERE wallet_address='0x1111111111111111111111111111111111111111' AND project_id='11111111-1111-4111-8111-111111111111') IS DISTINCT FROM current_setting('cloud.revisions_before') THEN RAISE EXCEPTION 'Erasure changed shared saved documents'; END IF;
  IF EXISTS(SELECT 1 FROM editor_cloud_revisions WHERE editor_wallet='0x2222222222222222222222222222222222222222') OR EXISTS(SELECT 1 FROM editor_cloud_uploads WHERE uploader_wallet='0x2222222222222222222222222222222222222222') THEN RAISE EXCEPTION 'Erased editor attribution or reservations remain'; END IF;
  IF (SELECT count(*) FROM editor_cloud_revisions WHERE editor_wallet='0x0000000000000000000000000000000000000000')<>2 THEN RAISE EXCEPTION 'Editor revisions not anonymized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE name='0x1111111111111111111111111111111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4') OR NOT EXISTS(SELECT 1 FROM editor_cloud_members WHERE member_wallet='0x3333333333333333333333333333333333333333' AND role='editor' AND accepted) THEN RAISE EXCEPTION 'Erasure removed owner source or other collaborator'; END IF;
END $$;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_history('11111111-1111-4111-8111-111111111111'))<>4 OR editor_cloud_load('11111111-1111-4111-8111-111111111111')->'document' IS DISTINCT FROM current_setting('cloud.edit_document')::jsonb THEN RAISE EXCEPTION 'Owner lost immutable shared history'; END IF;
END $$;
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
RESET ROLE;
ROLLBACK;
SELECT 'Accepted editor access, role escalation consent, shared source isolation, revision conflicts, nonce retries, upload revocation, Trash, owner quotas and erased contributor retention passed' AS result;
