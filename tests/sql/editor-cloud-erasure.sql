BEGIN;
SELECT set_config('request.headers','{}',false);
SET ROLE anon;
SELECT cloud_test_error($q$SELECT erase_editor_account_data('0x1111111111111111111111111111111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT erase_account_app_data('0x1111111111111111111111111111111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT account_erasure_storage('0x1111111111111111111111111111111111111111')$q$,'42501');
RESET ROLE;
SET ROLE authenticated;
SELECT cloud_test_error($q$SELECT erase_editor_account_data('0x1111111111111111111111111111111111111111')$q$,'42501');
SELECT cloud_test_error($q$SELECT erase_account_app_data('0x1111111111111111111111111111111111111111')$q$,'42501');
RESET ROLE;
SELECT cloud_test_error($q$SELECT erase_editor_account_data(NULL)$q$,'P0001');
SELECT cloud_test_error($q$SELECT erase_account_app_data('invalid')$q$,'P0001');
SELECT cloud_test_error($q$SELECT erase_editor_account_data('0x0000000000000000000000000000000000000000')$q$,'P0001');

INSERT INTO editor_cloud_projects(wallet_address,id,title,revision,trashed_at) VALUES
 ('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','Owned active',1,NULL),
 ('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111112','Owned Trash',1,now()),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','Other creator',1,NULL),
 ('0x3333333333333333333333333333333333333333','33333333-3333-4333-8333-333333333333','Unrelated Trash',1,now());
INSERT INTO editor_cloud_revisions(wallet_address,project_id,revision,request_id,document)
 SELECT wallet_address,id,1,id,jsonb_build_object('fixture',title) FROM editor_cloud_projects;
INSERT INTO editor_cloud_members(owner_wallet,project_id,member_wallet,role,accepted,revoked) VALUES
 ('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','0x4444444444444444444444444444444444444444','commenter',true,false),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','0x1111111111111111111111111111111111111111','commenter',true,false),
 ('0x3333333333333333333333333333333333333333','33333333-3333-4333-8333-333333333333','0x1111111111111111111111111111111111111111','viewer',false,true),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','0x4444444444444444444444444444444444444444','commenter',true,false);
INSERT INTO editor_cloud_comments(owner_wallet,project_id,id,author_wallet,revision,at_seconds,clip_id,body,assignee_wallet) VALUES
 ('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000011','0x4444444444444444444444444444444444444444',1,1.25,'owned','Owned project feedback',NULL),
 ('0x1111111111111111111111111111111111111111','11111111-1111-4111-8111-111111111112','00000000-0000-4000-8000-000000000012','0x1111111111111111111111111111111111111111',1,2,'trash','Owned trashed feedback',NULL),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000021','0x1111111111111111111111111111111111111111',1,6.125,'reveal','Erase my personal text','0x1111111111111111111111111111111111111111'),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000024','0x4444444444444444444444444444444444444444',1,8,'keep','Keep my text, clear the assignment','0x1111111111111111111111111111111111111111'),
 ('0x3333333333333333333333333333333333333333','33333333-3333-4333-8333-333333333333','00000000-0000-4000-8000-000000000031','0x3333333333333333333333333333333333333333',1,2,NULL,'Unrelated feedback',NULL);
INSERT INTO editor_cloud_comments(owner_wallet,project_id,id,author_wallet,revision,at_seconds,body,parent_id) VALUES
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000022','0x4444444444444444444444444444444444444444',1,6.125,'Keep my reply','00000000-0000-4000-8000-000000000021'),
 ('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000023','0x1111111111111111111111111111111111111111',1,6.125,'Erase my personal reply','00000000-0000-4000-8000-000000000021');
INSERT INTO editor_cloud_uploads(wallet_address,path,size_bytes) VALUES
 ('0x1111111111111111111111111111111111111111','0x1111111111111111111111111111111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4',10),
 ('0x2222222222222222222222222222222222222222','0x2222222222222222222222222222222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4',10);
INSERT INTO storage.objects(bucket_id,name,metadata)
 SELECT 'editor-project-media',path,'{"size":10}'::jsonb FROM editor_cloud_uploads;
INSERT INTO editor_assets(id,wallet_address) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','0x1111111111111111111111111111111111111111');
INSERT INTO stores(id,wallet_address,name,is_active) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','0x1111111111111111111111111111111111111111','Personal store',true);
INSERT INTO user_wallets(user_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

SET ROLE service_role;
DO $$ BEGIN
 IF (SELECT count(*) FROM account_erasure_storage('0x1111111111111111111111111111111111111111'))<>1 THEN RAISE EXCEPTION 'Editor media missing from existing storage manifest'; END IF;
END $$;
-- The worker removes actual files through Storage before invoking app cleanup.
DELETE FROM storage.objects WHERE (bucket_id,name) IN (SELECT bucket_id,name FROM account_erasure_storage('0x1111111111111111111111111111111111111111'));
SELECT erase_account_app_data('0x1111111111111111111111111111111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
RESET ROLE;
DO $$ DECLARE comment editor_cloud_comments; BEGIN
 IF EXISTS(SELECT 1 FROM editor_cloud_projects WHERE wallet_address='0x1111111111111111111111111111111111111111') OR EXISTS(SELECT 1 FROM editor_cloud_revisions WHERE wallet_address='0x1111111111111111111111111111111111111111') OR EXISTS(SELECT 1 FROM editor_cloud_comments WHERE owner_wallet='0x1111111111111111111111111111111111111111') THEN RAISE EXCEPTION 'Active or trashed owned project data remained'; END IF;
 IF EXISTS(SELECT 1 FROM editor_cloud_uploads WHERE wallet_address='0x1111111111111111111111111111111111111111') OR EXISTS(SELECT 1 FROM editor_cloud_members WHERE member_wallet='0x1111111111111111111111111111111111111111' OR owner_wallet='0x1111111111111111111111111111111111111111') THEN RAISE EXCEPTION 'Reservations or invitations remained'; END IF;
 IF EXISTS(SELECT 1 FROM editor_cloud_comments WHERE author_wallet='0x1111111111111111111111111111111111111111' OR assignee_wallet='0x1111111111111111111111111111111111111111' OR body LIKE 'Erase my%') THEN RAISE EXCEPTION 'Personal feedback or assignment remained'; END IF;
 IF (SELECT count(*) FROM editor_cloud_projects)<>2 OR (SELECT count(*) FROM editor_cloud_revisions)<>2 OR (SELECT count(*) FROM editor_cloud_comments)<>5 OR (SELECT count(*) FROM editor_cloud_members)<>1 OR (SELECT count(*) FROM editor_cloud_uploads)<>1 THEN RAISE EXCEPTION 'Other creators content was removed'; END IF;
 SELECT * INTO comment FROM editor_cloud_comments WHERE id='00000000-0000-4000-8000-000000000021';
 IF comment.author_wallet<>'0x0000000000000000000000000000000000000000' OR comment.body<>'[deleted]' OR comment.assignee_wallet IS NOT NULL OR comment.at_seconds<>6.125 OR comment.clip_id<>'reveal' OR comment.revision<>1 OR comment.state_version<>2 THEN RAISE EXCEPTION 'Erased root changed its anchor or was not anonymized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM editor_cloud_comments WHERE id='00000000-0000-4000-8000-000000000022' AND parent_id=comment.id AND body='Keep my reply' AND state_version=1) THEN RAISE EXCEPTION 'Peer reply was lost or altered'; END IF;
 IF NOT EXISTS(SELECT 1 FROM editor_cloud_comments WHERE id='00000000-0000-4000-8000-000000000024' AND body='Keep my text, clear the assignment' AND author_wallet='0x4444444444444444444444444444444444444444' AND assignee_wallet IS NULL AND state_version=2) THEN RAISE EXCEPTION 'Clearing assignee changed another author'; END IF;
 IF EXISTS(SELECT 1 FROM editor_assets) OR EXISTS(SELECT 1 FROM user_wallets) OR NOT EXISTS(SELECT 1 FROM stores WHERE name IS NULL AND NOT is_active) THEN RAISE EXCEPTION 'Existing account erasure behavior regressed'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='editor-project-media')<>1 OR EXISTS(SELECT 1 FROM account_erasure_storage('0x1111111111111111111111111111111111111111')) THEN RAISE EXCEPTION 'Storage cleanup missed erased media or removed other owners media'; END IF;
END $$;
SELECT set_config('cloud.erasure_after',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id)::text FROM editor_cloud_comments c),false);
SET ROLE service_role;
SELECT erase_account_app_data('0x1111111111111111111111111111111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM editor_cloud_comments c) IS DISTINCT FROM current_setting('cloud.erasure_after')::jsonb THEN RAISE EXCEPTION 'Erasure retry altered retained threads'; END IF;
END $$;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SET ROLE anon;
SELECT cloud_test_error($q$SELECT editor_cloud_review_load('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_review_accept('0x2222222222222222222222222222222222222222','22222222-2222-4222-8222-222222222222',1)$q$,'42501');
RESET ROLE;
ROLLBACK;
SELECT 'Service-only erasure, active/Trash cascade, media manifest, invitation removal, anonymized feedback, retained peer replies and idempotent retry passed' AS result;
