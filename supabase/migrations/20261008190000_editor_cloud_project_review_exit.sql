BEGIN;

CREATE FUNCTION public.editor_cloud_review_leave(p_owner text,p_id uuid,p_expected_state integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); member public.editor_cloud_members;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL THEN
    RAISE EXCEPTION 'Invalid project review';
  END IF;
  IF p_expected_state IS NULL OR p_expected_state<1 THEN
    RAISE EXCEPTION 'Project invitation changed. Refresh before leaving.' USING ERRCODE='40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud-inbox:'||wallet,0));
  SELECT * INTO member FROM public.editor_cloud_members
    WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=wallet FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project invitation is unavailable' USING ERRCODE='42501'; END IF;
  IF member.revoked AND NOT member.accepted AND member.state_version=p_expected_state+1 THEN
    RETURN public.editor_cloud_review_member_json(member);
  END IF;
  IF member.state_version<>p_expected_state THEN
    RAISE EXCEPTION 'Project invitation changed. Refresh before leaving.' USING ERRCODE='40001';
  END IF;
  IF NOT member.revoked THEN
    UPDATE public.editor_cloud_members SET accepted=false,revoked=true,state_version=state_version+1,updated_at=now()
      WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=wallet RETURNING * INTO member;
  END IF;
  RETURN public.editor_cloud_review_member_json(member);
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_review_leave(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_review_leave(text,uuid,integer) TO anon,authenticated;

COMMIT;
