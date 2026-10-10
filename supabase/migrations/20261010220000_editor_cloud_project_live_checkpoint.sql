BEGIN;
CREATE FUNCTION public.editor_cloud_live_checkpoint(p_owner text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE access jsonb;
BEGIN
  access:=public.editor_cloud_live_access(p_owner,p_id);
  RETURN access||jsonb_build_object('draftRevision',coalesce((SELECT revision FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id=p_id),0));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_live_checkpoint(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_live_checkpoint(text,uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
