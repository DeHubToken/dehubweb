BEGIN;
CREATE FUNCTION public.receipt_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT receipt_assert(EXISTS(SELECT 1 FROM editor_cloud_draft_receipts WHERE owner_wallet='0x7777777777777777777777777777777777777777'
  AND project_id='87878787-8787-4787-8787-878787878787' AND request_id='87000000-0000-4000-8000-000000000003'
  AND outcome='committed' AND committed_revision=1),'Existing writer receipt was not backfilled');
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT set_config('receipt.project','81818181-8181-4181-8181-818181818181',false);
SELECT set_config('receipt.document',jsonb_build_object('version',1,'snapshot',jsonb_build_object('id',current_setting('receipt.project'),'title','Saved baseline','updatedAt',1,
  'settings',jsonb_build_object('width',640,'height',360,'fps',30),'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','hidden',false,'muted',false)),
  'clips','[]'::jsonb),'media','[]'::jsonb)::text,false);
SELECT editor_cloud_save(current_setting('receipt.project')::uuid,current_setting('receipt.document')::jsonb,0,'81000000-0000-4000-8000-000000000001');
SELECT set_config('receipt.a',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,'81000000-0000-4000-8000-000000000002')::text,false);
SELECT set_config('receipt.b',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,'81000000-0000-4000-8000-000000000003')::text,false);
SELECT set_config('receipt.changed',jsonb_set(current_setting('receipt.document')::jsonb,'{snapshot,title}','"Owner A"')::text,false);
SELECT set_config('receipt.changed_b',jsonb_set(current_setting('receipt.document')::jsonb,'{snapshot,title}','"Owner B"')::text,false);
SELECT set_config('receipt.accepted',editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed')::jsonb,0,1,'81000000-0000-4000-8000-000000000010')::text,false);
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed_b')::jsonb,1,1,'81000000-0000-4000-8000-000000000011');
RESET ROLE;
UPDATE editor_cloud_draft_clients SET expires_at=now()-interval '1 second' WHERE writer_id=(current_setting('receipt.a')::jsonb->>'writerId')::uuid;
SET ROLE anon;
SELECT set_config('receipt.a_new',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,'81000000-0000-4000-8000-000000000002')::text,false);
SELECT set_config('receipt.resolved',editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed')::jsonb,0,1,'81000000-0000-4000-8000-000000000010')::text,false);
SELECT receipt_assert(current_setting('receipt.resolved')::jsonb->>'status'='committed','Expired writer lost its retained receipt');
SELECT receipt_assert(current_setting('receipt.resolved')::jsonb->'receipt'=current_setting('receipt.accepted')::jsonb,'Recovery changed the original receipt');
SELECT receipt_assert(editor_cloud_draft_load('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid)->'document'=current_setting('receipt.changed_b')::jsonb,'Receipt lookup overwrote another editor draft');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed')::jsonb,0,1,'81000000-0000-4000-8000-000000000010')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed_b')::jsonb,0,1,'81000000-0000-4000-8000-000000000010')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed')::jsonb,1,1,'81000000-0000-4000-8000-000000000010')$q$,'P0001');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.document')::jsonb,0,1,'81000000-0000-4000-8000-000000000012')$q$,'PT409');
SELECT set_config('receipt.fenced',editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.document')::jsonb,0,1,'81000000-0000-4000-8000-000000000012')::text,false);
SELECT receipt_assert(current_setting('receipt.fenced')::jsonb->>'status'='fenced','Rejected next request was not fenced');
SELECT receipt_assert(current_setting('receipt.fenced')::jsonb->'checkpoint'->'document'=current_setting('receipt.changed_b')::jsonb,'Fencing changed the current draft');
SELECT receipt_assert(editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.document')::jsonb,0,1,'81000000-0000-4000-8000-000000000012')=current_setting('receipt.fenced')::jsonb,'Fenced resolution was not idempotent');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.document')::jsonb,2,1,'81000000-0000-4000-8000-000000000012')$q$,'42501');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.changed_b')::jsonb,0,1,'81000000-0000-4000-8000-000000000012')$q$,'P0001');
RESET ROLE;
SELECT receipt_assert((SELECT expires_at='-infinity'::timestamptz FROM editor_cloud_draft_clients WHERE writer_id=(current_setting('receipt.b')::jsonb->>'writerId')::uuid),'Fence could admit an older transaction timestamp');
SELECT receipt_assert((SELECT count(*) FROM editor_cloud_revisions WHERE project_id=current_setting('receipt.project')::uuid)=1,'Resolution added permanent saved history');
UPDATE editor_cloud_draft_receipts SET expires_at=now()-interval '1 second' WHERE writer_id=(current_setting('receipt.a')::jsonb->>'writerId')::uuid;
SET ROLE anon;
SELECT receipt_assert(editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a')::jsonb->>'writerId')::uuid,1,current_setting('receipt.changed')::jsonb,0,1,'81000000-0000-4000-8000-000000000010')->>'status'='unknown','Missing proof was inferred from later content');
SELECT receipt_assert(editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  '81999999-9999-4999-8999-999999999999',1,current_setting('receipt.document')::jsonb,0,1,'81000000-0000-4000-8000-000000000020')->>'status'='unknown','Missing writer was declared rejected without fencing');
SELECT cloud_test_error($q$SELECT * FROM editor_cloud_draft_receipts$q$,'42501');
SELECT cloud_test_error($q$DELETE FROM editor_cloud_draft_receipts$q$,'42501');
SELECT editor_cloud_review_share(current_setting('receipt.project')::uuid,'0x2222222222222222222222222222222222222222','editor',0);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a_new')::jsonb->>'writerId')::uuid,1,current_setting('receipt.document')::jsonb,2,1,'81000000-0000-4000-8000-000000000021')$q$,'42501');
SELECT editor_cloud_review_accept('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,1);
SELECT receipt_assert(editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.a_new')::jsonb->>'writerId')::uuid,1,current_setting('receipt.document')::jsonb,2,1,'81000000-0000-4000-8000-000000000021')->>'status'='unknown','Another actor read or fenced the owner writer');
SELECT set_config('receipt.editor',editor_cloud_draft_open('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,'81000000-0000-4000-8000-000000000022')::text,false);
SELECT editor_cloud_draft_save('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.editor')::jsonb->>'writerId')::uuid,1,current_setting('receipt.document')::jsonb,2,1,'81000000-0000-4000-8000-000000000023');
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_review_share(current_setting('receipt.project')::uuid,'0x2222222222222222222222222222222222222222','none',2);
SELECT cloud_test_headers('0x2222222222222222222222222222222222222222');
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.editor')::jsonb->>'writerId')::uuid,1,current_setting('receipt.document')::jsonb,2,1,'81000000-0000-4000-8000-000000000023')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT erase_editor_account_data('0x2222222222222222222222222222222222222222');
RESET ROLE;
SELECT receipt_assert(NOT EXISTS(SELECT 1 FROM editor_cloud_draft_receipts WHERE actor_wallet='0x2222222222222222222222222222222222222222'),'Erased contributor receipts remain');
SET ROLE anon;
SELECT cloud_test_headers('0x1111111111111111111111111111111111111111');
SELECT editor_cloud_set_trash(current_setting('receipt.project')::uuid,1,0,true);
SELECT cloud_test_error($q$SELECT editor_cloud_draft_resolve('0x1111111111111111111111111111111111111111',current_setting('receipt.project')::uuid,
  (current_setting('receipt.b')::jsonb->>'writerId')::uuid,2,current_setting('receipt.document')::jsonb,0,1,'81000000-0000-4000-8000-000000000012')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT erase_editor_account_data('0x1111111111111111111111111111111111111111');
RESET ROLE;
SELECT receipt_assert(NOT EXISTS(SELECT 1 FROM editor_cloud_draft_receipts WHERE owner_wallet='0x1111111111111111111111111111111111111111'),'Owner erasure left receipts');
ROLLBACK;
SELECT 'Draft receipt recovery: expired writers, exact hashes, stable replay, atomic fencing, missing proof, actor isolation, RLS, revocation, Trash and erasure passed' AS result;
