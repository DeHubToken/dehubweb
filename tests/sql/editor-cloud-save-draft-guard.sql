BEGIN;
CREATE FUNCTION public.cloud_checkpoint_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT set_config('checkpoint.project','81818181-8181-4181-8181-818181818181',false);
SELECT set_config('checkpoint.base',jsonb_build_object('version',1,'snapshot',jsonb_build_object('id',current_setting('checkpoint.project'),'title','Baseline','updatedAt',1,
  'settings',jsonb_build_object('width',640,'height',360,'fps',30),'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','hidden',false,'muted',false)),
  'clips','[]'::jsonb),'media','[]'::jsonb)::text,false);
SELECT editor_cloud_save(current_setting('checkpoint.project')::uuid,current_setting('checkpoint.base')::jsonb,0,'81000000-0000-4000-8000-000000000001');
SELECT set_config('checkpoint.local',jsonb_set(current_setting('checkpoint.base')::jsonb,'{snapshot,title}','"Local"')::text,false);
SELECT set_config('checkpoint.first',editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,
  current_setting('checkpoint.local')::jsonb,1,0,'81000000-0000-4000-8000-000000000002')::text,false);
SELECT cloud_checkpoint_assert(current_setting('checkpoint.first')::jsonb->>'revision'='2' AND current_setting('checkpoint.first')::jsonb->>'draftRevision'='1','First save did not advance both counters');
SELECT cloud_checkpoint_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid)->>'anchorRevision'='2','Saved draft did not use its new immutable anchor');
SELECT set_config('checkpoint.writer',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,'81000000-0000-4000-8000-000000000003')::text,false);
SELECT set_config('checkpoint.live',jsonb_set(current_setting('checkpoint.local')::jsonb,'{snapshot,settings,background}','"#ffffff"')::text,false);
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,
  (current_setting('checkpoint.writer')::jsonb->>'writerId')::uuid,1,current_setting('checkpoint.live')::jsonb,1,2,'81000000-0000-4000-8000-000000000004');
SELECT cloud_checkpoint_assert(editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,
  current_setting('checkpoint.local')::jsonb,1,0,'81000000-0000-4000-8000-000000000002')=current_setting('checkpoint.first')::jsonb,'Lost response retry changed its original receipt');
SELECT cloud_checkpoint_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid)->'document'=current_setting('checkpoint.live')::jsonb,'Receipt recovery overwrote a newer live edit');
SELECT set_config('checkpoint.local2',jsonb_set(current_setting('checkpoint.local')::jsonb,'{snapshot,title}','"Local 2"')::text,false);
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local2')::jsonb,2,1,'81000000-0000-4000-8000-000000000005')$q$,'PT409');
SELECT cloud_test_error($q$SELECT editor_cloud_save(current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local2')::jsonb,2,'81000000-0000-4000-8000-000000000006')$q$,'PT409');
SELECT cloud_test_error($q$SELECT editor_cloud_edit_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local2')::jsonb,2,'81000000-0000-4000-8000-000000000007')$q$,'PT409');
SELECT cloud_test_error($q$SELECT editor_cloud_restore(current_setting('checkpoint.project')::uuid,1,2,'81000000-0000-4000-8000-000000000008')$q$,'PT409');
SELECT cloud_checkpoint_assert(editor_cloud_load(current_setting('checkpoint.project')::uuid)->>'revision'='2','Rejected stale saves advanced immutable history');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,2,1,'81000000-0000-4000-8000-000000000002')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local2')::jsonb,1,0,'81000000-0000-4000-8000-000000000002')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,0,2,'81000000-0000-4000-8000-000000000009')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,2,-1,'81000000-0000-4000-8000-000000000009')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,2,2147483646,'81000000-0000-4000-8000-000000000009')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,2,NULL,'81000000-0000-4000-8000-000000000009')$q$,'P0001');
-- An older client may save the exact current live document without losing it.
SELECT editor_cloud_save(current_setting('checkpoint.project')::uuid,current_setting('checkpoint.live')::jsonb,2,'81000000-0000-4000-8000-000000000010');
SELECT set_config('checkpoint.merged',jsonb_set(current_setting('checkpoint.live')::jsonb,'{snapshot,title}','"Local 2"')::text,false);
SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.merged')::jsonb,3,2,'81000000-0000-4000-8000-000000000011');
SELECT cloud_checkpoint_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid)->>'draftRevision'='3','Guarded save did not supersede the prior mutable baseline');
SELECT cloud_checkpoint_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid)->>'anchorRevision'='4','New permanent version did not advance the live anchor');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,
  (current_setting('checkpoint.writer')::jsonb->>'writerId')::uuid,2,current_setting('checkpoint.live')::jsonb,2,3,'81000000-0000-4000-8000-000000000012')$q$,'PT409');
SELECT cloud_test_error($q$UPDATE editor_cloud_revisions SET draft_base_revision=999$q$,'42501');
SELECT editor_cloud_review_share(current_setting('checkpoint.project')::uuid,'0x2222222222222222222222222222222222222222','editor',0);
SELECT editor_cloud_review_share(current_setting('checkpoint.project')::uuid,'0x3333333333333333333333333333333333333333','viewer',0);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.merged')::jsonb,4,3,'81000000-0000-4000-8000-000000000013')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,1);
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.local')::jsonb,1,0,'81000000-0000-4000-8000-000000000002')$q$,'P0001');
SELECT editor_cloud_prepare_shared_media('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,'81818181-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,'mp4');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('editor-project-media','0x1111111111111111111111111111111111111111/81818181-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4','{"size":10}');
SELECT set_config('checkpoint.media',jsonb_set(jsonb_set(current_setting('checkpoint.merged')::jsonb,'{snapshot,clips}',
  '[{"id":"c","trackId":"v","kind":"video","mediaId":"81818181-aaaa-4aaa-8aaa-aaaaaaaaaaaa","start":0,"duration":5,"trimIn":0}]'),'{media}',
  '[{"id":"81818181-aaaa-4aaa-8aaa-aaaaaaaaaaaa","storagePath":"0x1111111111111111111111111111111111111111/81818181-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.mp4","name":"Shared source","kind":"video","mimeType":"video/mp4","size":10}]')::text,false);
SELECT set_config('checkpoint.editor_receipt',editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.media')::jsonb,4,3,'81000000-0000-4000-8000-000000000014')::text,false);
SELECT cloud_checkpoint_assert(current_setting('checkpoint.editor_receipt')::jsonb->>'revision'='5','Accepted editor could not save its reserved private source');
SELECT cloud_checkpoint_assert(editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.media')::jsonb,4,3,'81000000-0000-4000-8000-000000000014')=current_setting('checkpoint.editor_receipt')::jsonb,'Editor replay did not preserve the exact receipt');
SELECT cloud_test_headers('0x3333333333333333333333333333333333333333');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,1);
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.media')::jsonb,5,4,'81000000-0000-4000-8000-000000000015')$q$,'42501');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share(current_setting('checkpoint.project')::uuid,'0x2222222222222222222222222222222222222222','none',2);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.media')::jsonb,4,3,'81000000-0000-4000-8000-000000000014')$q$,'42501');
SELECT set_config('request.headers','{}',false);
SELECT cloud_test_error($q$SELECT editor_cloud_checkpoint_save('0x1111111111111111111111111111111111111111',current_setting('checkpoint.project')::uuid,current_setting('checkpoint.media')::jsonb,5,4,'81000000-0000-4000-8000-000000000016')$q$,'42501');
RESET ROLE;
SELECT cloud_checkpoint_assert((SELECT saved_base_revision=1 AND draft_base_revision=0 FROM editor_cloud_revisions WHERE project_id=current_setting('checkpoint.project')::uuid AND revision=2),'Exact original Save baselines were not retained');
SELECT cloud_checkpoint_assert((SELECT saved_base_revision=4 AND draft_base_revision=3 AND editor_wallet='0x2222222222222222222222222222222222222222' FROM editor_cloud_revisions WHERE project_id=current_setting('checkpoint.project')::uuid AND revision=5),'Contributor receipt lost its actor or baselines');
SELECT cloud_checkpoint_assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.editor_cloud_checkpoint_save(text,uuid,jsonb,integer,integer,uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'Guarded save inherited public execution');
SELECT cloud_checkpoint_assert((SELECT prosecdef AND proconfig=ARRAY['search_path=public'] FROM pg_proc WHERE oid='public.editor_cloud_checkpoint_save(text,uuid,jsonb,integer,integer,uuid)'::regprocedure),'Guarded save security configuration changed');
ROLLBACK;
SELECT 'Permanent Save draft guards: dual revisions, exact nonce recovery, legacy protection, restore, accepted media, permissions and immutable anchors passed' AS result;
