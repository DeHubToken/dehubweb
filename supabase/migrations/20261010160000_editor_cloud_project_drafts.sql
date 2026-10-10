BEGIN;

DO $$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.editor_cloud_edit_save(text,uuid,jsonb,integer,uuid)')) IS DISTINCT FROM '2b1554e5367eb4477b14b172eebab675'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.erase_editor_account_data(text)')) IS DISTINCT FROM '228062882c4d12ba93f5fea324901310' THEN
    RAISE EXCEPTION 'Reconcile changed shared save or erasure functions before adding live drafts';
  END IF;
END $$;

CREATE TABLE public.editor_cloud_drafts (
  owner_wallet text NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  anchor_revision integer NOT NULL CHECK(anchor_revision>0),
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=8388608),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_wallet,project_id),
  FOREIGN KEY(owner_wallet,project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE
);
CREATE TABLE public.editor_cloud_draft_clients (
  owner_wallet text NOT NULL,
  project_id uuid NOT NULL,
  actor_wallet text NOT NULL CHECK(actor_wallet ~ '^0x[a-f0-9]{40}$'),
  client_id uuid NOT NULL,
  writer_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  sequence integer NOT NULL DEFAULT 0 CHECK(sequence>=0),
  request_id uuid,
  document_hash text,
  base_revision integer,
  anchor_revision integer,
  committed_revision integer,
  stored_at timestamptz,
  PRIMARY KEY(owner_wallet,project_id,actor_wallet,client_id),
  UNIQUE(writer_id),
  FOREIGN KEY(owner_wallet,project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE
);
ALTER TABLE public.editor_cloud_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_cloud_draft_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editor_cloud_drafts,public.editor_cloud_draft_clients FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.editor_cloud_drafts,public.editor_cloud_draft_clients TO service_role;

CREATE FUNCTION public.editor_cloud_draft_load(p_owner text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE access jsonb; draft public.editor_cloud_drafts; result jsonb;
BEGIN
  access:=public.editor_cloud_live_access(p_owner,p_id);
  SELECT * INTO draft FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id=p_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'draftRevision',draft.revision,
      'anchorRevision',draft.anchor_revision,'headRevision',(access->>'revision')::integer,'storedAt',draft.updated_at,'document',draft.document);
  END IF;
  SELECT jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'draftRevision',0,
    'anchorRevision',r.revision,'headRevision',r.revision,'storedAt',r.created_at,'document',r.document) INTO result
    FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id AND r.revision=(access->>'revision')::integer;
  IF result IS NULL THEN RAISE EXCEPTION 'Live draft baseline is unavailable' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

-- Opening a writer does not publish any local edits. Old expired writer IDs
-- never become valid again, even if a registration request is repeated.
CREATE FUNCTION public.editor_cloud_draft_open(p_owner text,p_id uuid,p_client_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet(); writer public.editor_cloud_draft_clients; checkpoint jsonb;
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL OR p_client_id IS NULL THEN RAISE EXCEPTION 'Invalid live draft registration'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  checkpoint:=public.editor_cloud_draft_load(p_owner,p_id);
  DELETE FROM public.editor_cloud_draft_clients WHERE owner_wallet=p_owner AND project_id=p_id AND expires_at<=now();
  SELECT * INTO writer FROM public.editor_cloud_draft_clients WHERE owner_wallet=p_owner AND project_id=p_id AND actor_wallet=actor AND client_id=p_client_id;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.editor_cloud_draft_clients WHERE owner_wallet=p_owner AND project_id=p_id)>=32 THEN
      RAISE EXCEPTION 'Live draft writer limit reached';
    END IF;
    INSERT INTO public.editor_cloud_draft_clients(owner_wallet,project_id,actor_wallet,client_id) VALUES(p_owner,p_id,actor,p_client_id) RETURNING * INTO writer;
  END IF;
  RETURN jsonb_build_object('writerId',writer.writer_id,'nextSequence',writer.sequence+1,'expiresAt',writer.expires_at,'checkpoint',checkpoint);
END $$;

CREATE FUNCTION public.editor_cloud_draft_save(p_owner text,p_id uuid,p_writer_id uuid,p_sequence integer,p_document jsonb,
  p_expected_revision integer,p_anchor_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor text:=public.editor_cloud_wallet(); access jsonb; writer public.editor_cloud_draft_clients;
  draft public.editor_cloud_drafts; item jsonb; content_hash text; next_revision integer; stored timestamptz:=now();
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL OR p_writer_id IS NULL OR p_request_id IS NULL
    OR p_sequence IS NULL OR p_sequence<1 OR p_sequence>=2147483647 OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_anchor_revision IS NULL OR p_anchor_revision<1 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
    OR octet_length(p_document::text)>8388608 THEN RAISE EXCEPTION 'Invalid or oversized live draft request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  access:=public.editor_cloud_live_access(p_owner,p_id);
  SELECT * INTO writer FROM public.editor_cloud_draft_clients WHERE owner_wallet=p_owner AND project_id=p_id AND actor_wallet=actor AND writer_id=p_writer_id FOR UPDATE;
  IF NOT FOUND OR writer.expires_at<=now() THEN RAISE EXCEPTION 'Live draft writer expired. Preserve your local edit and join again.' USING ERRCODE='42501'; END IF;
  content_hash:=encode(extensions.digest(convert_to(p_document::text,'UTF8'),'sha256'),'hex');
  IF p_sequence=writer.sequence THEN
    IF (writer.request_id,writer.document_hash,writer.base_revision,writer.anchor_revision)
      IS DISTINCT FROM (p_request_id,content_hash,p_expected_revision,p_anchor_revision) THEN
      RAISE EXCEPTION 'Live draft request was reused with different content';
    END IF;
    RETURN jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'draftRevision',writer.committed_revision,
      'anchorRevision',writer.anchor_revision,'sequence',writer.sequence,'requestId',writer.request_id,'storedAt',writer.stored_at);
  END IF;
  IF p_sequence<>writer.sequence+1 THEN RAISE EXCEPTION 'Live draft sequence was superseded. Preserve your local edit before recovering.' USING ERRCODE='PT409'; END IF;
  IF p_request_id=writer.request_id THEN RAISE EXCEPTION 'Use a new request for the next live draft edit'; END IF;
  SELECT * INTO draft FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id=p_id FOR UPDATE;
  IF coalesce(draft.revision,0)<>p_expected_revision OR (access->>'revision')::integer<>p_anchor_revision THEN
    RAISE EXCEPTION 'Live draft changed. Reconcile the exact baseline before saving.' USING ERRCODE='PT409';
  END IF;
  IF coalesce(draft.revision,0)>=2147483646 THEN RAISE EXCEPTION 'Live draft revision limit reached'; END IF;
  PERFORM public.editor_cloud_validate(p_document,p_id,p_owner);
  IF actor<>p_owner THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_document->'media') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id
          AND r.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
        AND NOT coalesce(draft.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))),false)
        AND NOT EXISTS(SELECT 1 FROM public.editor_cloud_uploads u WHERE u.wallet_address=p_owner AND u.shared_project_id=p_id
          AND u.uploader_wallet=actor AND u.path=item->>'storagePath') THEN
        RAISE EXCEPTION 'Live draft source belongs to another project' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;
  IF coalesce((SELECT sum(octet_length(document::text)) FROM public.editor_cloud_drafts WHERE owner_wallet=p_owner AND project_id<>p_id),0)+octet_length(p_document::text)>67108864 THEN
    RAISE EXCEPTION 'Live draft storage is full';
  END IF;
  next_revision:=coalesce(draft.revision,0)+1;
  INSERT INTO public.editor_cloud_drafts(owner_wallet,project_id,revision,anchor_revision,document,updated_at)
    VALUES(p_owner,p_id,next_revision,p_anchor_revision,p_document,stored)
    ON CONFLICT(owner_wallet,project_id) DO UPDATE SET revision=excluded.revision,anchor_revision=excluded.anchor_revision,document=excluded.document,updated_at=excluded.updated_at;
  UPDATE public.editor_cloud_draft_clients SET sequence=p_sequence,request_id=p_request_id,document_hash=content_hash,
    base_revision=p_expected_revision,anchor_revision=p_anchor_revision,committed_revision=next_revision,stored_at=stored,expires_at=stored+interval '1 hour'
    WHERE writer_id=p_writer_id;
  RETURN jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'draftRevision',next_revision,
    'anchorRevision',p_anchor_revision,'sequence',p_sequence,'requestId',p_request_id,'storedAt',stored);
END $$;

CREATE FUNCTION public.editor_cloud_draft_media_allowed(p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_drafts d WHERE d.owner_wallet=split_part(p_path,'/',1)
    AND public.editor_cloud_edit_allowed(d.owner_wallet,d.project_id)
    AND d.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',p_path))));
END $$;
CREATE POLICY editor_project_media_live_editor_read ON storage.objects FOR SELECT TO anon,authenticated
  USING(CASE WHEN bucket_id='editor-project-media' THEN public.editor_cloud_draft_media_allowed(name) ELSE false END);

REVOKE ALL ON FUNCTION public.editor_cloud_draft_load(text,uuid),public.editor_cloud_draft_open(text,uuid,uuid),
  public.editor_cloud_draft_save(text,uuid,uuid,integer,jsonb,integer,integer,uuid),public.editor_cloud_draft_media_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_draft_load(text,uuid),public.editor_cloud_draft_open(text,uuid,uuid),
  public.editor_cloud_draft_save(text,uuid,uuid,integer,jsonb,integer,integer,uuid),public.editor_cloud_draft_media_allowed(text) TO anon,authenticated;

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

CREATE OR REPLACE FUNCTION public.erase_editor_account_data(p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w text := lower(p_wallet);
  owner text;
BEGIN
  IF w IS NULL OR w !~ '^0x[a-f0-9]{40}$' OR w='0x0000000000000000000000000000000000000000' THEN
    RAISE EXCEPTION 'Invalid wallet';
  END IF;
  -- Review mutations lock the owner before the recipient inbox. Keep that
  -- order, sorting multiple owners so overlapping erasures cannot deadlock.
  FOR owner IN SELECT address FROM (
    SELECT w AS address
    UNION SELECT owner_wallet FROM public.editor_cloud_members WHERE member_wallet=w
    UNION SELECT owner_wallet FROM public.editor_cloud_comments WHERE author_wallet=w OR assignee_wallet=w
    UNION SELECT wallet_address FROM public.editor_cloud_revisions WHERE editor_wallet=w
    UNION SELECT wallet_address FROM public.editor_cloud_uploads WHERE uploader_wallet=w
    UNION SELECT owner_wallet FROM public.editor_cloud_draft_clients WHERE actor_wallet=w
  ) owners ORDER BY address LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||owner,0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud-inbox:'||w,0));
  -- Active and trashed projects cascade their own revisions and review rows.
  DELETE FROM public.editor_cloud_projects WHERE wallet_address=w;
  DELETE FROM public.editor_cloud_uploads WHERE wallet_address=w OR uploader_wallet=w;
  UPDATE public.editor_cloud_revisions SET editor_wallet='0x0000000000000000000000000000000000000000' WHERE editor_wallet=w;
  DELETE FROM public.editor_cloud_draft_clients WHERE actor_wallet=w;
  DELETE FROM public.editor_cloud_members WHERE member_wallet=w;
  UPDATE public.editor_cloud_comments SET
    author_wallet=CASE WHEN author_wallet=w THEN '0x0000000000000000000000000000000000000000' ELSE author_wallet END,
    body=CASE WHEN author_wallet=w THEN '[deleted]' ELSE body END,
    assignee_wallet=CASE WHEN assignee_wallet=w THEN NULL ELSE assignee_wallet END,
    state_version=state_version+1, updated_at=now()
    WHERE author_wallet=w OR assignee_wallet=w;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
