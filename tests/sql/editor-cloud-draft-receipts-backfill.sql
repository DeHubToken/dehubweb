-- Seed an existing writer before the receipt migration, on the hosted fixture database.
SET ROLE anon;
SELECT cloud_test_headers('0x7777777777777777777777777777777777777777');
SELECT set_config('receipt.seed_project','87878787-8787-4787-8787-878787878787',false);
SELECT set_config('receipt.seed_document',jsonb_build_object('version',1,'snapshot',jsonb_build_object('id',current_setting('receipt.seed_project'),'title','Existing writer','updatedAt',1,
  'settings',jsonb_build_object('width',640,'height',360,'fps',30),'tracks',jsonb_build_array(jsonb_build_object('id','v','kind','video','name','Video','hidden',false,'muted',false)),
  'clips','[]'::jsonb),'media','[]'::jsonb)::text,false);
SELECT editor_cloud_save(current_setting('receipt.seed_project')::uuid,current_setting('receipt.seed_document')::jsonb,0,'87000000-0000-4000-8000-000000000001');
SELECT set_config('receipt.seed_writer',editor_cloud_draft_open('0x7777777777777777777777777777777777777777',current_setting('receipt.seed_project')::uuid,'87000000-0000-4000-8000-000000000002')::text,false);
SELECT editor_cloud_draft_save('0x7777777777777777777777777777777777777777',current_setting('receipt.seed_project')::uuid,
  (current_setting('receipt.seed_writer')::jsonb->>'writerId')::uuid,1,current_setting('receipt.seed_document')::jsonb,0,1,'87000000-0000-4000-8000-000000000003');
RESET ROLE;
