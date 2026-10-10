BEGIN;
CREATE FUNCTION public.cloud_draft_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT set_config('draft.project','71717171-7171-4171-8171-717171717171',false);
SELECT set_config('draft.document',jsonb_build_object('version',1,'snapshot',jsonb_build_object('id',current_setting('draft.project'),'title','Saved baseline','updatedAt',1,
  'settings',jsonb_build_object('width',640,'height',360,'fps',30),'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','hidden',false,'muted',false)),
  'clips','[]'::jsonb),'media','[]'::jsonb)::text,false);
SELECT editor_cloud_save(current_setting('draft.project')::uuid,current_setting('draft.document')::jsonb,0,'71000000-0000-4000-8000-000000000001');
SELECT cloud_draft_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)->>'draftRevision'='0','Initial draft did not use saved baseline');
SELECT set_config('draft.a',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000002')::text,false);
SELECT set_config('draft.b',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000003')::text,false);
SELECT cloud_draft_assert(editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000002')->>'writerId'=current_setting('draft.a')::jsonb->>'writerId','Unknown open response registered a duplicate writer');
SELECT set_config('draft.changed',jsonb_set(current_setting('draft.document')::jsonb,'{snapshot,title}','"Owner device A"')::text,false);
SELECT set_config('draft.receipt_a',editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed')::jsonb,0,1,'71000000-0000-4000-8000-000000000010')::text,false);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.b')::jsonb->>'writerId')::uuid,1,current_setting('draft.document')::jsonb,0,1,'71000000-0000-4000-8000-000000000011')$q$,'PT409');
SELECT set_config('draft.changed_b',jsonb_set(current_setting('draft.document')::jsonb,'{snapshot,title}','"Owner device B"')::text,false);
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.b')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed_b')::jsonb,1,1,'71000000-0000-4000-8000-000000000011');
SELECT cloud_draft_assert(editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed')::jsonb,0,1,'71000000-0000-4000-8000-000000000010')=current_setting('draft.receipt_a')::jsonb,
  'Unknown A response replayed over the later B commit');
SELECT cloud_draft_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)->'document'=current_setting('draft.changed_b')::jsonb,'Receipt recovery changed the current draft');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.document')::jsonb,0,1,'71000000-0000-4000-8000-000000000010')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed')::jsonb,1,1,'71000000-0000-4000-8000-000000000010')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,3,current_setting('draft.changed')::jsonb,2,1,'71000000-0000-4000-8000-000000000012')$q$,'PT409');
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,2,current_setting('draft.changed')::jsonb,2,1,'71000000-0000-4000-8000-000000000012');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed')::jsonb,0,1,'71000000-0000-4000-8000-000000000010')$q$,'PT409');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,3,current_setting('draft.changed')::jsonb,3,1,'71000000-0000-4000-8000-000000000012')$q$,'P0001');
SELECT editor_cloud_review_share(current_setting('draft.project')::uuid,'0x2222222222222222222222222222222222222222','editor',0);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000020')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,1);
SELECT set_config('draft.c',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000020')::text,false);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,3,current_setting('draft.document')::jsonb,3,1,'71000000-0000-4000-8000-000000000021')$q$,'42501');
SELECT cloud_test_error($q$SELECT * FROM editor_cloud_drafts$q$,'42501');
SELECT cloud_test_error($q$UPDATE editor_cloud_draft_clients SET sequence=100$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_load('0x2222222222222222222222222222222222222222',current_setting('draft.project')::uuid)$q$,'42501');
SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":10}');
SELECT set_config('draft.with_media',jsonb_set(jsonb_set(current_setting('draft.changed')::jsonb,'{snapshot,clips}',
  '[{"id":"c","trackId":"v","kind":"video","mediaId":"71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa","start":0,"duration":5,"trimIn":0}]'),'{media}',
  '[{"id":"71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa","storagePath":"0x1111111111111111111111111111111111111111/71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4","name":"Draft source","kind":"video","mimeType":"video/mp4","size":10}]')::text,false);
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.c')::jsonb->>'writerId')::uuid,1,current_setting('draft.with_media')::jsonb,3,1,'71000000-0000-4000-8000-000000000022');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share(current_setting('draft.project')::uuid,'0x3333333333333333333333333333333333333333','editor',0);
SELECT editor_cloud_review_share(current_setting('draft.project')::uuid,'0x4444444444444444444444444444444444444444','viewer',0);
SELECT cloud_test_headers('0x4444444444444444444444444444444444444444');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,1);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)$q$,'42501');
SELECT cloud_draft_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE name='0x1111111111111111111111111111111111111111/71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4'),'Viewer read an unsaved live source');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,1);
SELECT set_config('draft.d',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000023')::text,false);
SELECT cloud_draft_assert(EXISTS(SELECT 1 FROM storage.objects WHERE name='0x1111111111111111111111111111111111111111/71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4'),'Other editor could not hydrate a committed live source');
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.d')::jsonb->>'writerId')::uuid,1,current_setting('draft.with_media')::jsonb,4,1,'71000000-0000-4000-8000-000000000024');
SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,current_setting('draft.with_media')::jsonb,1,'71000000-0000-4000-8000-000000000025');
SELECT cloud_draft_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)->>'anchorRevision'='1','Saving silently dropped the live baseline');
SELECT cloud_draft_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)->>'headRevision'='2','Draft did not report the changed saved head');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.d')::jsonb->>'writerId')::uuid,2,current_setting('draft.with_media')::jsonb,5,1,'71000000-0000-4000-8000-000000000026')$q$,'PT409');
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.d')::jsonb->>'writerId')::uuid,2,current_setting('draft.with_media')::jsonb,5,2,'71000000-0000-4000-8000-000000000026');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_prepare_media('71717171-bbbb-4bbb-8bbb-bbbbbbbbbbbb',20,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/71717171-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.mp4','{"size":20}');
SELECT set_config('draft.other_document',replace(replace(replace(current_setting('draft.with_media'),'71717171-7171-4171-8171-717171717171','72727272-7272-4272-8272-727272727272'),'71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa','71717171-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'"size": 10','"size": 20'),false);
SELECT editor_cloud_save('72727272-7272-4272-8272-727272727272',current_setting('draft.other_document')::jsonb,0,'71000000-0000-4000-8000-000000000027');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.d')::jsonb->>'writerId')::uuid,3,jsonb_set(current_setting('draft.other_document')::jsonb,'{snapshot,id}',to_jsonb(current_setting('draft.project'))),6,2,'71000000-0000-4000-8000-000000000028')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.d')::jsonb->>'writerId')::uuid,3,jsonb_set(current_setting('draft.document')::jsonb,'{padding}',to_jsonb(repeat('x',8388608))),6,2,'71000000-0000-4000-8000-000000000029')$q$,'P0001');
RESET ROLE;
SELECT cloud_draft_assert((SELECT count(*) FROM editor_cloud_revisions WHERE project_id=current_setting('draft.project')::uuid)=2,'Draft checkpoints appended permanent history');
UPDATE editor_cloud_draft_clients SET expires_at=now()-interval '1 second' WHERE writer_id=(current_setting('draft.a')::jsonb->>'writerId')::uuid;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,3,current_setting('draft.document')::jsonb,6,2,'71000000-0000-4000-8000-000000000030')$q$,'42501');
SELECT set_config('draft.a_new',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000002')::text,false);
SELECT cloud_draft_assert(current_setting('draft.a_new')::jsonb->>'writerId'<>current_setting('draft.a')::jsonb->>'writerId','Expired writer identity was revived');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a')::jsonb->>'writerId')::uuid,1,current_setting('draft.changed')::jsonb,0,1,'71000000-0000-4000-8000-000000000010')$q$,'42501');
DO $$ DECLARE i integer; BEGIN
  FOR i IN 1..28 LOOP PERFORM editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,(lpad(i::text,8,'0')||'-7171-4171-8171-717171717171')::uuid); END LOOP;
END $$;
SELECT cloud_test_error($q$SELECT editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000031')$q$,'P0001');
RESET ROLE;
DO $$ DECLARE i integer; pid uuid; BEGIN
  FOR i IN 1..8 LOOP
    pid:=(lpad(i::text,8,'0')||'-7272-4272-8272-727272727272')::uuid;
    INSERT INTO editor_cloud_projects(wallet_address,id,title,revision) VALUES('0x1111111111111111111111111111111111111111',pid,'Quota fixture',1);
    INSERT INTO editor_cloud_drafts(owner_wallet,project_id,revision,anchor_revision,document) VALUES('0x1111111111111111111111111111111111111111',pid,1,1,jsonb_build_object('padding',repeat('x',8388000)));
  END LOOP;
END $$;
SET ROLE anon;
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.a_new')::jsonb->>'writerId')::uuid,1,jsonb_set(current_setting('draft.document')::jsonb,'{padding}',to_jsonb(repeat('x',10000))),6,2,'71000000-0000-4000-8000-000000000032')$q$,'P0001');
SELECT editor_cloud_review_share(current_setting('draft.project')::uuid,'0x2222222222222222222222222222222222222222','none',2);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,
  (current_setting('draft.c')::jsonb->>'writerId')::uuid,1,current_setting('draft.with_media')::jsonb,3,1,'71000000-0000-4000-8000-000000000022')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT erase_editor_account_data('0x2222222222222222222222222222222222222222');
RESET ROLE;
SELECT cloud_draft_assert(NOT EXISTS(SELECT 1 FROM editor_cloud_draft_clients WHERE actor_wallet='0x2222222222222222222222222222222222222222'),'Erased editor writer receipts remain');
SELECT cloud_draft_assert((SELECT document FROM editor_cloud_drafts WHERE project_id=current_setting('draft.project')::uuid)=current_setting('draft.with_media')::jsonb,'Contributor erasure removed the owner draft');
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash(current_setting('draft.project')::uuid,2,0,true);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)$q$,'42501');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid)$q$,'42501');
SELECT cloud_draft_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE name='0x1111111111111111111111111111111111111111/71717171-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4'),'Trashed draft media still readable by a collaborator');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333',extract(epoch FROM now())::bigint-1);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('draft.project')::uuid,'71000000-0000-4000-8000-000000000033')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT erase_editor_account_data('0x1111111111111111111111111111111111111111');
RESET ROLE;
SELECT cloud_draft_assert(NOT EXISTS(SELECT 1 FROM editor_cloud_drafts WHERE owner_wallet='0x1111111111111111111111111111111111111111') AND
  NOT EXISTS(SELECT 1 FROM editor_cloud_draft_clients WHERE owner_wallet='0x1111111111111111111111111111111111111111'),'Owner erasure left private drafts or writer receipts');
ROLLBACK;
SELECT 'Bounded live drafts: CAS, exact receipt recovery, sequences, expired writers, accepted editor sources, saved anchor, limits, RLS, revocation, Trash and erasure passed' AS result;
