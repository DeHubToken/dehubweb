BEGIN;

ALTER TABLE public.editor_cloud_projects
  ADD COLUMN trashed_at timestamptz,
  ADD COLUMN state_version integer NOT NULL DEFAULT 0 CHECK(state_version>=0);
CREATE INDEX editor_cloud_projects_trash ON public.editor_cloud_projects(wallet_address,trashed_at DESC) WHERE trashed_at IS NOT NULL;

-- Trash keeps every revision and immutable media object. No purge or expiry.
CREATE OR REPLACE FUNCTION public.editor_cloud_save(p_id uuid,p_document jsonb,p_expected_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); project public.editor_cloud_projects; previous public.editor_cloud_revisions; next_revision integer;
BEGIN
  IF p_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'Invalid save request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||wallet,0));
  SELECT * INTO previous FROM public.editor_cloud_revisions WHERE wallet_address=wallet AND project_id=p_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.document IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'Save request was reused with different content'; END IF;
    RETURN jsonb_build_object('projectId',p_id,'revision',previous.revision,'savedAt',previous.created_at);
  END IF;
  SELECT * INTO project FROM public.editor_cloud_projects WHERE wallet_address=wallet AND id=p_id FOR UPDATE;
  IF project.trashed_at IS NOT NULL THEN RAISE EXCEPTION 'This project is in Trash. Restore it or save a separate copy.' USING ERRCODE='40001'; END IF;
  IF coalesce(project.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'A newer cloud version exists. Open it or save a separate copy.' USING ERRCODE='40001'; END IF;
  PERFORM public.editor_cloud_validate(p_document,p_id,wallet);
  IF project.id IS NULL AND (SELECT count(*) FROM public.editor_cloud_projects WHERE wallet_address=wallet)>=200 THEN RAISE EXCEPTION 'Cloud project limit reached'; END IF;
  IF coalesce((SELECT sum(octet_length(document::text)) FROM public.editor_cloud_revisions WHERE wallet_address=wallet),0)+octet_length(p_document::text)>268435456 THEN
    RAISE EXCEPTION 'Cloud project history storage is full';
  END IF;
  IF project.id IS NULL THEN
    INSERT INTO public.editor_cloud_projects(wallet_address,id,title) VALUES(wallet,p_id,p_document->'snapshot'->>'title');
  END IF;
  next_revision:=p_expected_revision+1;
  INSERT INTO public.editor_cloud_revisions(wallet_address,project_id,revision,request_id,document) VALUES(wallet,p_id,next_revision,p_request_id,p_document);
  UPDATE public.editor_cloud_projects SET title=p_document->'snapshot'->>'title',revision=next_revision,updated_at=now() WHERE wallet_address=wallet AND id=p_id;
  RETURN jsonb_build_object('projectId',p_id,'revision',next_revision,'savedAt',now());
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('projectId',id,'title',title,'revision',revision,'savedAt',updated_at,'stateVersion',state_version,'trashedAt',trashed_at) ORDER BY updated_at DESC,id),'[]'::jsonb)
  FROM public.editor_cloud_projects WHERE wallet_address=public.editor_cloud_wallet() AND trashed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.editor_cloud_load(p_id uuid,p_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); result jsonb;
BEGIN
  SELECT jsonb_build_object('projectId',p.id,'revision',r.revision,'headRevision',p.revision,'savedAt',r.created_at,'document',r.document) INTO result
  FROM public.editor_cloud_projects p JOIN public.editor_cloud_revisions r ON r.wallet_address=p.wallet_address AND r.project_id=p.id
  WHERE p.wallet_address=wallet AND p.id=p_id AND p.trashed_at IS NULL AND r.revision=coalesce(p_revision,p.revision);
  IF result IS NULL THEN RAISE EXCEPTION 'Cloud project version was not found' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_history(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('projectId',project_id,'revision',revision,'title',document->'snapshot'->>'title','savedAt',created_at) ORDER BY revision DESC),'[]'::jsonb)
  FROM public.editor_cloud_revisions r WHERE r.wallet_address=public.editor_cloud_wallet() AND r.project_id=p_id
    AND EXISTS(SELECT 1 FROM public.editor_cloud_projects p WHERE p.wallet_address=r.wallet_address AND p.id=r.project_id AND p.trashed_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.editor_cloud_list_trash() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('projectId',id,'title',title,'revision',revision,'savedAt',updated_at,'stateVersion',state_version,'trashedAt',trashed_at) ORDER BY trashed_at DESC,id),'[]'::jsonb)
  FROM public.editor_cloud_projects WHERE wallet_address=public.editor_cloud_wallet() AND trashed_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.editor_cloud_set_trash(p_id uuid,p_expected_revision integer,p_expected_state integer,p_trashed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); project public.editor_cloud_projects;
BEGIN
  IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_expected_state IS NULL OR p_expected_state<0 OR p_trashed IS NULL THEN
    RAISE EXCEPTION 'Invalid cloud project Trash request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||wallet,0));
  SELECT * INTO project FROM public.editor_cloud_projects WHERE wallet_address=wallet AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cloud project was not found' USING ERRCODE='42501'; END IF;
  IF project.revision<>p_expected_revision THEN RAISE EXCEPTION 'This project has newer edits. Refresh before moving it.' USING ERRCODE='40001'; END IF;
  -- A lost response can be retried only while the observed state is unchanged.
  IF project.state_version=p_expected_state+1 AND (project.trashed_at IS NOT NULL)=p_trashed THEN
    RETURN jsonb_build_object('projectId',project.id,'title',project.title,'revision',project.revision,'savedAt',project.updated_at,'stateVersion',project.state_version,'trashedAt',project.trashed_at);
  END IF;
  IF project.state_version<>p_expected_state THEN RAISE EXCEPTION 'This project moved since you viewed it. Refresh before moving it.' USING ERRCODE='40001'; END IF;
  IF (project.trashed_at IS NOT NULL) IS DISTINCT FROM p_trashed THEN
    UPDATE public.editor_cloud_projects SET trashed_at=CASE WHEN p_trashed THEN now() ELSE NULL END,state_version=state_version+1
    WHERE wallet_address=wallet AND id=p_id RETURNING * INTO project;
  END IF;
  RETURN jsonb_build_object('projectId',project.id,'title',project.title,'revision',project.revision,'savedAt',project.updated_at,'stateVersion',project.state_version,'trashedAt',project.trashed_at);
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_list_trash(),public.editor_cloud_set_trash(uuid,integer,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_list_trash(),public.editor_cloud_set_trash(uuid,integer,integer,boolean) TO anon,authenticated;

COMMIT;
