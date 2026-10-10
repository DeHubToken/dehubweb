BEGIN;
SELECT set_config('request.headers','{}',false);
SET ROLE anon;
SELECT cloud_test_error('SELECT editor_cloud_review_inbox()','42501');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comments('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000,'mp4');
SELECT editor_cloud_prepare_media('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1000,'mp4');
SELECT editor_cloud_prepare_media('cccccccc-cccc-4ccc-8ccc-cccccccccccc',1000,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('editor-project-media','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":1000}'),
 ('editor-project-media','0x1111111111111111111111111111111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4','{"size":1000}');
SELECT set_config('cloud.review_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','title','Review fixture','updatedAt',1,
  'settings',jsonb_build_object('width',1920,'height',1080,'fps',30,'background','#000000','aspectPreset','16:9'),
  'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','muted',false,'hidden',false)),
  'clips',jsonb_build_array(jsonb_build_object('id','c','kind','video','trackId','v','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',0,'duration',10,'trimIn',0))),
  'media',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','storagePath','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','name','Source.mp4','kind','video','mimeType','video/mp4','size',1000)))::text,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',current_setting('cloud.review_document')::jsonb,0,'00000000-0000-4000-8000-000000000001');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','viewer',0);
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','viewer',0);
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_members('11111111-1111-4111-8111-111111111111'))<>1 THEN RAISE EXCEPTION 'Invitation retry duplicated a member'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x1111111111111111111111111111111111111111','viewer',0)$q$,'P0001');
SELECT cloud_test_error($q$INSERT INTO editor_cloud_members(owner_wallet,project_id,member_wallet,role) VALUES('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','commenter')$q$,'42501');

SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_inbox())<>1 THEN RAISE EXCEPTION 'Invitation missing from recipient inbox'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Pending invitation could read source media'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','commenter',0)$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
DO $$ BEGIN
  IF editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')->>'revision'<>'1' THEN RAISE EXCEPTION 'Accepted review did not load exact revision'; END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='editor-project-media')<>1 THEN RAISE EXCEPTION 'Review access leaked unreferenced owner media'; END IF;
  IF EXISTS(SELECT 1 FROM editor_cloud_projects) OR EXISTS(SELECT 1 FROM editor_cloud_revisions) THEN RAISE EXCEPTION 'Review granted general owner table access'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,2.25,'Change this cut','c')$q$,'42501');
SELECT cloud_test_error($q$INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc/source.mp4','{"size":1000}')$q$,'42501');

SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','commenter',2);
SELECT cloud_test_error($q$SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','viewer',1)$q$,'PT409');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x3333333333333333333333333333333333333333','commenter',0);
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,2.25,'  Change this cut  ','c');
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,2.25,'Change this cut','c');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,3,'Different','c')$q$,'P0001');
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000012',1,2.25,'Reply on the original frame','c','00000000-0000-4000-8000-000000000011');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,3,'Wrong reply frame','c','00000000-0000-4000-8000-000000000011')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,2.25,'Nested reply','c','00000000-0000-4000-8000-000000000012')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,11,'Outside duration','c')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,1,'Missing clip','deleted')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,'NaN','Invalid number','c')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,1,'  ','c')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,1,repeat('x',2001),'c')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000013',1,1,'Foreign assignee','c',null,'0x4444444444444444444444444444444444444444')$q$,'P0001');
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000014',1,4,'Assigned feedback','c',null,'0x3333333333333333333333333333333333333333');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_comments('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111'))<>3 THEN RAISE EXCEPTION 'Retries or invalid anchors created comments'; END IF;
END $$;
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,true)$q$,'42501');
SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000014',1,true);
SELECT cloud_test_error($q$SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000012',1,true)$q$,'42501');
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,true);
SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,true);
SELECT cloud_test_error($q$SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,false)$q$,'PT409');
SELECT editor_cloud_review_resolve('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',2,false);

SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','none',3);
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','none',3);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM editor_cloud_comments) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Revocation left review/media access'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011',1,2.25,'Change this cut','c')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share('11111111-1111-4111-8111-111111111111','0x2222222222222222222222222222222222222222','commenter',4);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',3)$q$,'PT409');
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',5);
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,0,true);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM editor_cloud_comments) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media') THEN RAISE EXCEPTION 'Trash left review/media access'; END IF;
END $$;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash('11111111-1111-4111-8111-111111111111',1,1,false);
SELECT editor_cloud_save('11111111-1111-4111-8111-111111111111',jsonb_set(current_setting('cloud.review_document')::jsonb,'{snapshot,clips,0,duration}','1'),1,'00000000-0000-4000-8000-000000000002');
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000015',1,8,'Anchor in the original version','c');
SELECT cloud_test_error($q$SELECT editor_cloud_review_comment('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000016',2,8,'Outside shortened version','c')$q$,'P0001');
SELECT cloud_test_headers('0x4444444444444444444444444444444444444444');
DO $$ BEGIN
  IF editor_cloud_review_inbox()<>'[]'::jsonb OR EXISTS(SELECT 1 FROM editor_cloud_members) OR EXISTS(SELECT 1 FROM editor_cloud_comments) THEN RAISE EXCEPTION 'Foreign account read reviewer data'; END IF;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_review_comments('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111',1)$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
DO $$ BEGIN
  IF jsonb_array_length(editor_cloud_review_comments('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111'))<>4 THEN RAISE EXCEPTION 'Trash/revocation erased feedback'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Accepted review permissions, scoped media, immutable comments/retries, exact revision/time anchors, replies, assignment, resolve conflicts, revocation, Trash retention and account isolation passed' AS result;
