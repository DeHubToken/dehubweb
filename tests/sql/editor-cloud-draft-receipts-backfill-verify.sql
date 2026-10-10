BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_draft_receipts WHERE owner_wallet='0x7777777777777777777777777777777777777777'
    AND project_id='87878787-8787-4787-8787-878787878787' AND request_id='87000000-0000-4000-8000-000000000003'
    AND outcome='committed' AND committed_revision=1) THEN
    RAISE EXCEPTION 'Existing writer receipt was not backfilled';
  END IF;
  DELETE FROM public.editor_cloud_projects WHERE wallet_address='0x7777777777777777777777777777777777777777'
    AND id='87878787-8787-4787-8787-878787878787';
END $$;
COMMIT;
SELECT 'Existing writer receipt backfill and isolated fixture cleanup passed' AS result;
