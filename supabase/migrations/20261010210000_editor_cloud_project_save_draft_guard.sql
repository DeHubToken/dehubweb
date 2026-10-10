-- Permanent saves compare both the saved head and mutable draft under the owner lock.
BEGIN;
ALTER TABLE public.editor_cloud_revisions
  ADD COLUMN saved_base_revision integer,
  ADD COLUMN draft_base_revision integer,
  ADD CONSTRAINT editor_cloud_revision_checkpoint_base CHECK (
    (saved_base_revision IS NULL AND draft_base_revision IS NULL) OR
    (saved_base_revision IS NOT NULL AND draft_base_revision IS NOT NULL AND
      saved_base_revision>=1 AND saved_base_revision<2147483646 AND draft_base_revision>=0 AND draft_base_revision<2147483646));

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
  IF project.trashed_at IS NOT NULL THEN RAISE EXCEPTION 'This project is in Trash. Restore it or save a separate copy.' USING ERRCODE='PT409'; END IF;
  IF coalesce(project.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'A newer cloud version exists. Open it or save a separate copy.' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.editor_cloud_drafts d WHERE d.owner_wallet=wallet AND d.project_id=p_id
    AND d.document IS DISTINCT FROM p_document AND d.document IS DISTINCT FROM
      (SELECT r.document FROM public.editor_cloud_revisions r WHERE r.wallet_address=wallet AND r.project_id=p_id AND r.revision=project.revision)) THEN
    RAISE EXCEPTION 'Newer live edits exist. Receive them before saving or save a separate copy.' USING ERRCODE='PT409';
  END IF;
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

CREATE OR REPLACE FUNCTION public.editor_cloud_edit_save(p_owner text,p_id uuid,p_document jsonb,p_expected_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet(); project public.editor_cloud_projects; previous public.editor_cloud_revisions; item jsonb; next_revision integer;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 THEN
    RAISE EXCEPTION 'Invalid shared edit request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  IF NOT public.editor_cloud_edit_allowed(p_owner,p_id) THEN RAISE EXCEPTION 'Project editing access is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO previous FROM public.editor_cloud_revisions WHERE wallet_address=p_owner AND project_id=p_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.document IS DISTINCT FROM p_document OR coalesce(previous.editor_wallet,p_owner)<>actor THEN RAISE EXCEPTION 'Shared save request was reused'; END IF;
    RETURN jsonb_build_object('projectId',p_id,'revision',previous.revision,'savedAt',previous.created_at);
  END IF;
  SELECT * INTO project FROM public.editor_cloud_projects WHERE wallet_address=p_owner AND id=p_id FOR UPDATE;
  IF project.revision<>p_expected_revision THEN RAISE EXCEPTION 'A newer shared version exists. Open it or save your edit as a separate copy.' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.editor_cloud_drafts d WHERE d.owner_wallet=p_owner AND d.project_id=p_id
    AND d.document IS DISTINCT FROM p_document AND d.document IS DISTINCT FROM
      (SELECT r.document FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id AND r.revision=project.revision)) THEN
    RAISE EXCEPTION 'Newer live edits exist. Receive them before saving or save a separate copy.' USING ERRCODE='PT409';
  END IF;
  PERFORM public.editor_cloud_validate(p_document,p_id,p_owner);
  IF actor<>p_owner THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_document->'media') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id
          AND r.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
        AND NOT EXISTS(SELECT 1 FROM public.editor_cloud_drafts d WHERE d.owner_wallet=p_owner AND d.project_id=p_id
          AND d.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
        AND NOT EXISTS(SELECT 1 FROM public.editor_cloud_uploads u WHERE u.path=item->>'storagePath' AND u.wallet_address=p_owner
          AND u.shared_project_id=p_id AND u.uploader_wallet=actor) THEN
        RAISE EXCEPTION 'Source belongs to another project' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;
  IF coalesce((SELECT sum(octet_length(document::text)) FROM public.editor_cloud_revisions WHERE wallet_address=p_owner),0)+octet_length(p_document::text)>268435456 THEN
    RAISE EXCEPTION 'Cloud project history storage is full';
  END IF;
  next_revision:=project.revision+1;
  INSERT INTO public.editor_cloud_revisions(wallet_address,project_id,revision,request_id,document,editor_wallet)
    VALUES(p_owner,p_id,next_revision,p_request_id,p_document,actor);
  UPDATE public.editor_cloud_projects SET title=p_document->'snapshot'->>'title',revision=next_revision,updated_at=now()
    WHERE wallet_address=p_owner AND id=p_id;
  RETURN jsonb_build_object('projectId',p_id,'revision',next_revision,'savedAt',now());
END $$;

CREATE FUNCTION public.editor_cloud_checkpoint_save(p_owner text,p_id uuid,p_document jsonb,p_expected_revision integer,p_expected_draft_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet(); project public.editor_cloud_projects; previous public.editor_cloud_revisions; item jsonb; next_revision integer; draft public.editor_cloud_drafts; next_draft_revision integer;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_expected_revision>=2147483646
    OR p_expected_draft_revision IS NULL OR p_expected_draft_revision<0 OR p_expected_draft_revision>=2147483646 THEN
    RAISE EXCEPTION 'Invalid shared edit request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  IF NOT public.editor_cloud_edit_allowed(p_owner,p_id) THEN RAISE EXCEPTION 'Project editing access is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO previous FROM public.editor_cloud_revisions WHERE wallet_address=p_owner AND project_id=p_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.document IS DISTINCT FROM p_document OR coalesce(previous.editor_wallet,p_owner)<>actor
      OR previous.saved_base_revision IS DISTINCT FROM p_expected_revision OR previous.draft_base_revision IS DISTINCT FROM p_expected_draft_revision THEN RAISE EXCEPTION 'Shared save request was reused'; END IF;
    RETURN jsonb_build_object('projectId',p_id,'revision',previous.revision,'draftRevision',previous.draft_base_revision+1,'savedAt',previous.created_at);
  END IF;
  SELECT * INTO project FROM public.editor_cloud_projects WHERE wallet_address=p_owner AND id=p_id FOR UPDATE;
  IF project.revision<>p_expected_revision THEN RAISE EXCEPTION 'A newer shared version exists. Open it or save your edit as a separate copy.' USING ERRCODE='PT409'; END IF;
  SELECT * INTO draft FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id=p_id FOR UPDATE;
  IF coalesce(draft.revision,0)<>p_expected_draft_revision THEN
    RAISE EXCEPTION 'Newer live edits exist. Reconcile the exact draft before saving.' USING ERRCODE='PT409';
  END IF;
  PERFORM public.editor_cloud_validate(p_document,p_id,p_owner);

  IF actor<>p_owner THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_document->'media') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id
          AND r.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
        AND NOT EXISTS(SELECT 1 FROM public.editor_cloud_drafts d WHERE d.owner_wallet=p_owner AND d.project_id=p_id
          AND d.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
        AND NOT EXISTS(SELECT 1 FROM public.editor_cloud_uploads u WHERE u.path=item->>'storagePath' AND u.wallet_address=p_owner
          AND u.shared_project_id=p_id AND u.uploader_wallet=actor) THEN
        RAISE EXCEPTION 'Source belongs to another project' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;
  IF coalesce((SELECT sum(octet_length(document::text)) FROM public.editor_cloud_revisions WHERE wallet_address=p_owner),0)+octet_length(p_document::text)>268435456 THEN
    RAISE EXCEPTION 'Cloud project history storage is full';
  END IF;
  IF coalesce((SELECT sum(octet_length(document::text)) FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id<>p_id),0)+octet_length(p_document::text)>67108864 THEN
    RAISE EXCEPTION 'Live draft storage is full';
  END IF;
  next_revision:=project.revision+1; next_draft_revision:=coalesce(draft.revision,0)+1;
  INSERT INTO public.editor_cloud_revisions(wallet_address,project_id,revision,request_id,document,editor_wallet,saved_base_revision,draft_base_revision)
    VALUES(p_owner,p_id,next_revision,p_request_id,p_document,actor,p_expected_revision,p_expected_draft_revision);
  UPDATE public.editor_cloud_projects SET title=p_document->'snapshot'->>'title',revision=next_revision,updated_at=now()
    WHERE wallet_address=p_owner AND id=p_id;
  INSERT INTO public.editor_cloud_drafts(owner_wallet,project_id,revision,anchor_revision,document,updated_at)
    VALUES(p_owner,p_id,next_draft_revision,next_revision,p_document,now())
    ON CONFLICT(owner_wallet,project_id) DO UPDATE SET revision=excluded.revision,anchor_revision=excluded.anchor_revision,document=excluded.document,updated_at=excluded.updated_at;
  RETURN jsonb_build_object('projectId',p_id,'revision',next_revision,'draftRevision',next_draft_revision,'savedAt',now());
END $$;

REVOKE ALL ON FUNCTION public.editor_cloud_checkpoint_save(text,uuid,jsonb,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_checkpoint_save(text,uuid,jsonb,integer,integer,uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
