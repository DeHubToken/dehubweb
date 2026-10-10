BEGIN;

DO $$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.editor_cloud_draft_save(text,uuid,uuid,integer,jsonb,integer,integer,uuid)')) IS DISTINCT FROM '5ab40f33dbc7b11a54e2faa6665caba4'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.erase_editor_account_data(text)')) IS DISTINCT FROM '40f052cd4c03d1bd84ea46f387bf5fcb' THEN
    RAISE EXCEPTION 'Reconcile changed draft save or erasure functions before adding receipt recovery';
  END IF;
END $$;

-- One recent outcome per writer survives the shorter writer lease. Documents
-- stay in private drafts; the journal stores only their exact request hash.
CREATE TABLE public.editor_cloud_draft_receipts (
  writer_id uuid PRIMARY KEY,
  owner_wallet text NOT NULL,
  project_id uuid NOT NULL,
  actor_wallet text NOT NULL CHECK(actor_wallet ~ '^0x[a-f0-9]{40}$'),
  sequence integer NOT NULL CHECK(sequence>0 AND sequence<2147483647),
  request_id uuid NOT NULL,
  document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
  base_revision integer NOT NULL CHECK(base_revision>=0),
  anchor_revision integer NOT NULL CHECK(anchor_revision>0),
  outcome text NOT NULL CHECK(outcome IN ('committed','fenced')),
  committed_revision integer,
  stored_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK((outcome='committed' AND committed_revision IS NOT NULL AND committed_revision>0) OR (outcome='fenced' AND committed_revision IS NULL)),
  FOREIGN KEY(owner_wallet,project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE
);
CREATE INDEX editor_cloud_draft_receipts_owner ON public.editor_cloud_draft_receipts(owner_wallet,project_id);
CREATE INDEX editor_cloud_draft_receipts_actor ON public.editor_cloud_draft_receipts(actor_wallet);
ALTER TABLE public.editor_cloud_draft_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editor_cloud_draft_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.editor_cloud_draft_receipts TO service_role;

-- Retain the last outcome already known by existing writers, without inventing
-- proof for writers that were previously removed.
INSERT INTO public.editor_cloud_draft_receipts(writer_id,owner_wallet,project_id,actor_wallet,sequence,request_id,
  document_hash,base_revision,anchor_revision,outcome,committed_revision,stored_at,expires_at)
SELECT writer_id,owner_wallet,project_id,actor_wallet,sequence,request_id,document_hash,base_revision,anchor_revision,
  'committed',committed_revision,stored_at,stored_at+interval '7 days'
FROM public.editor_cloud_draft_clients WHERE sequence>0 AND request_id IS NOT NULL AND document_hash ~ '^[a-f0-9]{64}$'
  AND base_revision>=0 AND anchor_revision>0 AND committed_revision>0 AND stored_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.editor_cloud_draft_save(p_owner text, p_id uuid, p_writer_id uuid, p_sequence integer, p_document jsonb, p_expected_revision integer, p_anchor_revision integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  -- Expired operational receipts have no recovery promise. An unknown device
  -- request is kept locally rather than inferred from a later document.
  DELETE FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner AND expires_at<=now();
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_draft_receipts WHERE writer_id=p_writer_id) AND
    ((SELECT count(*) FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner AND project_id=p_id)>=4096
      OR (SELECT count(*) FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner)>=32768) THEN
    RAISE EXCEPTION 'Live draft receipt storage is full. Preserve your local edit.';
  END IF;
  next_revision:=coalesce(draft.revision,0)+1;
  INSERT INTO public.editor_cloud_drafts(owner_wallet,project_id,revision,anchor_revision,document,updated_at)
    VALUES(p_owner,p_id,next_revision,p_anchor_revision,p_document,stored)
    ON CONFLICT(owner_wallet,project_id) DO UPDATE SET revision=excluded.revision,anchor_revision=excluded.anchor_revision,document=excluded.document,updated_at=excluded.updated_at;
  UPDATE public.editor_cloud_draft_clients SET sequence=p_sequence,request_id=p_request_id,document_hash=content_hash,
    base_revision=p_expected_revision,anchor_revision=p_anchor_revision,committed_revision=next_revision,stored_at=stored,expires_at=stored+interval '1 hour'
    WHERE writer_id=p_writer_id;
  INSERT INTO public.editor_cloud_draft_receipts(writer_id,owner_wallet,project_id,actor_wallet,sequence,request_id,
    document_hash,base_revision,anchor_revision,outcome,committed_revision,stored_at,expires_at)
  VALUES(p_writer_id,p_owner,p_id,actor,p_sequence,p_request_id,content_hash,p_expected_revision,p_anchor_revision,
    'committed',next_revision,stored,stored+interval '7 days')
  ON CONFLICT(writer_id) DO UPDATE SET sequence=excluded.sequence,request_id=excluded.request_id,
    document_hash=excluded.document_hash,base_revision=excluded.base_revision,anchor_revision=excluded.anchor_revision,
    outcome=excluded.outcome,committed_revision=excluded.committed_revision,stored_at=excluded.stored_at,expires_at=excluded.expires_at;
  RETURN jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'draftRevision',next_revision,
    'anchorRevision',p_anchor_revision,'sequence',p_sequence,'requestId',p_request_id,'storedAt',stored);
END $function$

CREATE FUNCTION public.editor_cloud_draft_resolve(p_owner text,p_id uuid,p_writer_id uuid,p_sequence integer,p_document jsonb,
  p_expected_revision integer,p_anchor_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor text:=public.editor_cloud_wallet(); writer public.editor_cloud_draft_clients;
  proof public.editor_cloud_draft_receipts; content_hash text; envelope jsonb; stored timestamptz:=now();
BEGIN
  IF p_owner IS NULL OR p_owner !~ '^0x[a-f0-9]{40}$' OR p_id IS NULL OR p_writer_id IS NULL OR p_request_id IS NULL
    OR p_sequence IS NULL OR p_sequence<1 OR p_sequence>=2147483647 OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_anchor_revision IS NULL OR p_anchor_revision<1 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
    OR octet_length(p_document::text)>8388608 THEN RAISE EXCEPTION 'Invalid or oversized live draft resolution'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  PERFORM public.editor_cloud_live_access(p_owner,p_id);
  PERFORM public.editor_cloud_validate(p_document,p_id,p_owner);
  content_hash:=encode(extensions.digest(convert_to(p_document::text,'UTF8'),'sha256'),'hex');
  envelope:=jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,'writerId',p_writer_id,'sequence',p_sequence,'requestId',p_request_id);
  SELECT * INTO proof FROM public.editor_cloud_draft_receipts WHERE writer_id=p_writer_id AND owner_wallet=p_owner
    AND project_id=p_id AND actor_wallet=actor AND expires_at>now();
  IF FOUND AND proof.sequence=p_sequence THEN
    IF (proof.request_id,proof.document_hash,proof.base_revision,proof.anchor_revision)
      IS DISTINCT FROM (p_request_id,content_hash,p_expected_revision,p_anchor_revision) THEN
      RAISE EXCEPTION 'Live draft resolution does not match its recorded request';
    END IF;
    IF proof.outcome='committed' THEN
      RETURN envelope || jsonb_build_object('status','committed','receipt',jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,
        'draftRevision',proof.committed_revision,'anchorRevision',proof.anchor_revision,'sequence',proof.sequence,'requestId',proof.request_id,'storedAt',proof.stored_at));
    END IF;
    RETURN envelope || jsonb_build_object('status','fenced','checkpoint',public.editor_cloud_draft_load(p_owner,p_id));
  END IF;
  SELECT * INTO writer FROM public.editor_cloud_draft_clients WHERE writer_id=p_writer_id AND owner_wallet=p_owner
    AND project_id=p_id AND actor_wallet=actor FOR UPDATE;
  IF NOT FOUND THEN RETURN envelope || jsonb_build_object('status','unknown'); END IF;
  IF writer.sequence=p_sequence THEN
    IF (writer.request_id,writer.document_hash,writer.base_revision,writer.anchor_revision)
      IS DISTINCT FROM (p_request_id,content_hash,p_expected_revision,p_anchor_revision) THEN
      RAISE EXCEPTION 'Live draft resolution does not match its writer request';
    END IF;
    RETURN envelope || jsonb_build_object('status','committed','receipt',jsonb_build_object('ownerWallet',p_owner,'projectId',p_id,
      'draftRevision',writer.committed_revision,'anchorRevision',writer.anchor_revision,'sequence',writer.sequence,'requestId',writer.request_id,'storedAt',writer.stored_at));
  END IF;
  IF p_sequence<>writer.sequence+1 OR p_request_id=writer.request_id THEN
    RETURN envelope || jsonb_build_object('status','unknown');
  END IF;
  -- Expired operational receipts have no recovery promise. An unknown device
  -- request is kept locally rather than inferred from a later document.
  DELETE FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner AND expires_at<=now();
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_draft_receipts WHERE writer_id=p_writer_id) AND
    ((SELECT count(*) FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner AND project_id=p_id)>=4096
      OR (SELECT count(*) FROM public.editor_cloud_draft_receipts WHERE owner_wallet=p_owner)>=32768) THEN
    RAISE EXCEPTION 'Live draft receipt storage is full. Preserve your local edit.';
  END IF;

  -- A delayed transaction can have an older now() than this resolver. Negative
  -- infinity fences it too; setting expiry to the resolver's now() would not.
  UPDATE public.editor_cloud_draft_clients SET expires_at='-infinity'::timestamptz WHERE writer_id=p_writer_id;
  INSERT INTO public.editor_cloud_draft_receipts(writer_id,owner_wallet,project_id,actor_wallet,sequence,request_id,
    document_hash,base_revision,anchor_revision,outcome,committed_revision,stored_at,expires_at)
  VALUES(p_writer_id,p_owner,p_id,actor,p_sequence,p_request_id,content_hash,p_expected_revision,p_anchor_revision,
    'fenced',NULL,stored,stored+interval '7 days')
  ON CONFLICT(writer_id) DO UPDATE SET sequence=excluded.sequence,request_id=excluded.request_id,
    document_hash=excluded.document_hash,base_revision=excluded.base_revision,anchor_revision=excluded.anchor_revision,
    outcome=excluded.outcome,committed_revision=NULL,stored_at=excluded.stored_at,expires_at=excluded.expires_at;
  RETURN envelope || jsonb_build_object('status','fenced','checkpoint',public.editor_cloud_draft_load(p_owner,p_id));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_draft_resolve(text,uuid,uuid,integer,jsonb,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_draft_resolve(text,uuid,uuid,integer,jsonb,integer,integer,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.erase_editor_account_data(p_wallet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    UNION SELECT owner_wallet FROM public.editor_cloud_draft_receipts WHERE actor_wallet=w
  ) owners ORDER BY address LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||owner,0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud-inbox:'||w,0));
  -- Active and trashed projects cascade their own revisions and review rows.
  DELETE FROM public.editor_cloud_projects WHERE wallet_address=w;
  DELETE FROM public.editor_cloud_uploads WHERE wallet_address=w OR uploader_wallet=w;
  UPDATE public.editor_cloud_revisions SET editor_wallet='0x0000000000000000000000000000000000000000' WHERE editor_wallet=w;
  DELETE FROM public.editor_cloud_draft_clients WHERE actor_wallet=w;
  DELETE FROM public.editor_cloud_draft_receipts WHERE actor_wallet=w;
  DELETE FROM public.editor_cloud_members WHERE member_wallet=w;
  UPDATE public.editor_cloud_comments SET
    author_wallet=CASE WHEN author_wallet=w THEN '0x0000000000000000000000000000000000000000' ELSE author_wallet END,
    body=CASE WHEN author_wallet=w THEN '[deleted]' ELSE body END,
    assignee_wallet=CASE WHEN assignee_wallet=w THEN NULL ELSE assignee_wallet END,
    state_version=state_version+1, updated_at=now()
    WHERE author_wallet=w OR assignee_wallet=w;
END;
$function$

COMMIT;
