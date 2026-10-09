BEGIN;

CREATE FUNCTION public.editor_cloud_live_access(p_owner text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet(); project public.editor_cloud_projects;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL
    OR NOT public.editor_cloud_edit_allowed(p_owner,p_id) THEN
    RAISE EXCEPTION 'Live editing access is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO project FROM public.editor_cloud_projects WHERE wallet_address=p_owner AND id=p_id AND trashed_at IS NULL;
  IF NOT FOUND OR project.revision<1 THEN RAISE EXCEPTION 'Live editing access is unavailable' USING ERRCODE='42501'; END IF;
  -- Return only this account's role and the saved head, never documents or invitations.
  RETURN jsonb_build_object('wallet',actor,'ownerWallet',p_owner,'projectId',p_id,
    'role',CASE WHEN actor=p_owner THEN 'owner' ELSE 'editor' END,'revision',project.revision);
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_live_access(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_live_access(text,uuid) TO anon,authenticated;

COMMIT;
