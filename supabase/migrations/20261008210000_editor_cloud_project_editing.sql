BEGIN;

ALTER TABLE public.editor_cloud_members DROP CONSTRAINT editor_cloud_members_role_check;
ALTER TABLE public.editor_cloud_members ADD CONSTRAINT editor_cloud_members_role_check CHECK(role IN ('viewer','commenter','editor'));
ALTER TABLE public.editor_cloud_uploads ADD COLUMN shared_project_id uuid, ADD COLUMN uploader_wallet text;
ALTER TABLE public.editor_cloud_uploads ADD CONSTRAINT editor_cloud_shared_upload_project
  FOREIGN KEY(wallet_address,shared_project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE;
ALTER TABLE public.editor_cloud_uploads ADD CONSTRAINT editor_cloud_shared_upload_actor
  CHECK((shared_project_id IS NULL AND uploader_wallet IS NULL) OR (shared_project_id IS NOT NULL AND uploader_wallet IS NOT NULL AND uploader_wallet ~ '^0x[a-f0-9]{40}$'));
ALTER TABLE public.editor_cloud_revisions ADD COLUMN editor_wallet text CHECK(editor_wallet ~ '^0x[a-f0-9]{40}$');

CREATE FUNCTION public.editor_cloud_edit_allowed(p_owner text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_projects p WHERE p.wallet_address=p_owner AND p.id=p_id AND p.trashed_at IS NULL
    AND (actor=p_owner OR EXISTS(SELECT 1 FROM public.editor_cloud_members m WHERE m.owner_wallet=p_owner AND m.project_id=p_id
      AND m.member_wallet=actor AND m.role='editor' AND m.accepted AND NOT m.revoked)));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_edit_allowed(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_edit_allowed(text,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.editor_cloud_review_allowed(p_owner text,p_id uuid,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_projects p WHERE p.wallet_address=p_owner AND p.id=p_id AND p.trashed_at IS NULL
    AND (p_owner=wallet OR EXISTS(SELECT 1 FROM public.editor_cloud_members m WHERE m.owner_wallet=p_owner AND m.project_id=p_id
      AND m.member_wallet=wallet AND m.accepted AND NOT m.revoked AND (NOT p_write OR m.role IN ('commenter','editor')))));
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_review_share(p_id uuid,p_member text,p_role text,p_expected_state integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); member text:=lower(p_member); previous public.editor_cloud_members; next_member public.editor_cloud_members;
BEGIN
  IF p_id IS NULL OR member IS NULL OR member !~ '^0x[a-f0-9]{40}$' OR member=wallet
    OR p_role IS NULL OR p_role NOT IN ('viewer','commenter','editor','none') OR p_expected_state IS NULL OR p_expected_state<0 THEN
    RAISE EXCEPTION 'Invalid project sharing request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||wallet,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud-inbox:'||member,0));
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_projects WHERE wallet_address=wallet AND id=p_id AND trashed_at IS NULL) THEN
    RAISE EXCEPTION 'Cloud project is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO previous FROM public.editor_cloud_members WHERE owner_wallet=wallet AND project_id=p_id AND member_wallet=member FOR UPDATE;
  IF previous.state_version=p_expected_state+1 AND previous.revoked=(p_role='none') AND (p_role='none' OR previous.role=p_role) THEN
    RETURN public.editor_cloud_review_member_json(previous);
  END IF;
  IF coalesce(previous.state_version,0)<>p_expected_state THEN RAISE EXCEPTION 'Project access changed. Refresh before sharing.' USING ERRCODE='40001'; END IF;
  IF p_role='none' AND previous.project_id IS NULL THEN RAISE EXCEPTION 'Project invitation was not found'; END IF;
  IF p_role<>'none' AND coalesce(previous.revoked,true) THEN
    IF (SELECT count(*) FROM public.editor_cloud_members WHERE owner_wallet=wallet AND project_id=p_id AND NOT revoked)>=50 THEN RAISE EXCEPTION 'Project reviewer limit reached'; END IF;
    IF (SELECT count(*) FROM public.editor_cloud_members WHERE member_wallet=member AND NOT revoked)>=200 THEN RAISE EXCEPTION 'Reviewer invitation limit reached'; END IF;
  END IF;
  INSERT INTO public.editor_cloud_members(owner_wallet,project_id,member_wallet,role,accepted,revoked,state_version)
    VALUES(wallet,p_id,member,CASE WHEN p_role='none' THEN previous.role ELSE p_role END,false,false,1)
    ON CONFLICT(owner_wallet,project_id,member_wallet) DO UPDATE SET
      role=CASE WHEN p_role='none' THEN previous.role ELSE p_role END,
      accepted=CASE WHEN p_role='none' OR previous.revoked OR (p_role='editor' AND previous.role<>'editor') THEN false ELSE previous.accepted END,
      revoked=(p_role='none'),state_version=previous.state_version+1,updated_at=now()
    RETURNING * INTO next_member;
  RETURN public.editor_cloud_review_member_json(next_member);
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_review_comment(p_owner text,p_id uuid,p_comment_id uuid,p_revision integer,p_time numeric,p_body text,p_clip_id text DEFAULT NULL,p_parent_id uuid DEFAULT NULL,p_assignee text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); existing public.editor_cloud_comments; parent public.editor_cloud_comments; document jsonb; duration numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  IF NOT public.editor_cloud_review_allowed(p_owner,p_id,true) THEN RAISE EXCEPTION 'Comment access is unavailable' USING ERRCODE='42501'; END IF;
  IF p_comment_id IS NULL OR p_revision IS NULL OR p_revision<=0 OR p_time IS NULL OR p_time<0 OR p_time>86400
    OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid project comment'; END IF;
  SELECT * INTO existing FROM public.editor_cloud_comments WHERE owner_wallet=p_owner AND project_id=p_id AND id=p_comment_id;
  IF FOUND THEN
    IF (existing.author_wallet,existing.revision,existing.at_seconds,existing.body,existing.clip_id,existing.parent_id,existing.assignee_wallet)
      IS DISTINCT FROM (wallet,p_revision,p_time,btrim(p_body),p_clip_id,p_parent_id,p_assignee) THEN RAISE EXCEPTION 'Comment request was reused with different content'; END IF;
    RETURN public.editor_cloud_review_comment_json(existing);
  END IF;
  SELECT r.document INTO document FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id AND r.revision=p_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment version is unavailable'; END IF;
  SELECT coalesce(max((c->>'start')::numeric+(c->>'duration')::numeric),0) INTO duration FROM jsonb_array_elements(document->'snapshot'->'clips') c;
  IF p_time>duration OR (p_clip_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(document->'snapshot'->'clips') c WHERE c->>'id'=p_clip_id)) THEN
    RAISE EXCEPTION 'Comment anchor is outside the saved version';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.editor_cloud_comments WHERE owner_wallet=p_owner AND project_id=p_id AND id=p_parent_id AND parent_id IS NULL;
    IF NOT FOUND OR (parent.revision,parent.at_seconds,parent.clip_id) IS DISTINCT FROM (p_revision,p_time,p_clip_id) THEN RAISE EXCEPTION 'Reply anchor does not match its thread'; END IF;
  END IF;
  IF p_assignee IS NOT NULL AND (p_assignee !~ '^0x[a-f0-9]{40}$' OR (p_assignee<>p_owner AND NOT EXISTS(
    SELECT 1 FROM public.editor_cloud_members WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=p_assignee AND accepted AND NOT revoked AND role IN ('commenter','editor')))) THEN
    RAISE EXCEPTION 'Assign comments to an accepted project commenter';
  END IF;
  IF (SELECT count(*) FROM public.editor_cloud_comments WHERE owner_wallet=p_owner AND project_id=p_id)>=2000 THEN RAISE EXCEPTION 'Project comment limit reached'; END IF;
  INSERT INTO public.editor_cloud_comments(owner_wallet,project_id,id,author_wallet,revision,at_seconds,clip_id,body,parent_id,assignee_wallet)
    VALUES(p_owner,p_id,p_comment_id,wallet,p_revision,p_time,p_clip_id,btrim(p_body),p_parent_id,p_assignee) RETURNING * INTO existing;
  RETURN public.editor_cloud_review_comment_json(existing);
END $$;

CREATE FUNCTION public.editor_cloud_edit_load(p_owner text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.editor_cloud_edit_allowed(p_owner,p_id) THEN RAISE EXCEPTION 'Project editing access is unavailable' USING ERRCODE='42501'; END IF;
  RETURN public.editor_cloud_review_load(p_owner,p_id);
END $$;

CREATE FUNCTION public.editor_cloud_edit_save(p_owner text,p_id uuid,p_document jsonb,p_expected_revision integer,p_request_id uuid) RETURNS jsonb
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
  IF project.revision<>p_expected_revision THEN RAISE EXCEPTION 'A newer shared version exists. Open it or save your edit as a separate copy.' USING ERRCODE='40001'; END IF;
  PERFORM public.editor_cloud_validate(p_document,p_id,p_owner);
  IF actor<>p_owner THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_document->'media') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_revisions r WHERE r.wallet_address=p_owner AND r.project_id=p_id
          AND r.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',item->>'storagePath'))))
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

CREATE FUNCTION public.editor_cloud_prepare_shared_media(p_owner text,p_project uuid,p_id uuid,p_size bigint,p_extension text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=p_owner; actor text:=public.editor_cloud_wallet(); object_path text; usage bigint; reserved bigint; existing public.editor_cloud_uploads;
BEGIN
  IF p_id IS NULL OR p_size IS NULL OR p_size<=0 OR p_size>1073741824 OR p_extension IS NULL OR p_extension !~ '^[a-z0-9]{1,5}$' THEN
    RAISE EXCEPTION 'Invalid cloud project media upload';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||wallet,0));
  IF NOT public.editor_cloud_edit_allowed(p_owner,p_project) THEN RAISE EXCEPTION 'Project editing access is unavailable' USING ERRCODE='42501'; END IF;
  object_path:=wallet||'/'||p_id::text||'/source.'||p_extension;
  SELECT * INTO existing FROM public.editor_cloud_uploads WHERE path=object_path;
  IF FOUND AND (existing.shared_project_id IS DISTINCT FROM p_project OR existing.uploader_wallet IS DISTINCT FROM actor) THEN RAISE EXCEPTION 'Upload belongs to another project or creator'; END IF;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media' AND name=object_path) THEN RAISE EXCEPTION 'Upload a new project source'; END IF;
  IF FOUND AND existing.size_bytes<>p_size THEN RAISE EXCEPTION 'Cloud media is immutable; upload a new source'; END IF;
  SELECT coalesce(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END),0) INTO usage
    FROM storage.objects WHERE bucket_id='editor-project-media' AND split_part(name,'/',1)=wallet;
  SELECT coalesce(sum(u.size_bytes),0) INTO reserved FROM public.editor_cloud_uploads u
    WHERE u.wallet_address=wallet AND u.expires_at>now() AND u.path<>object_path
      AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='editor-project-media' AND o.name=u.path AND coalesce((o.metadata->>'size')::bigint,0)>0);
  IF usage+reserved+(CASE WHEN EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media' AND name=object_path AND coalesce((metadata->>'size')::bigint,0)>0) THEN 0 ELSE p_size END)>10737418240 THEN
    RAISE EXCEPTION 'Cloud project media storage is full';
  END IF;
  INSERT INTO public.editor_cloud_uploads(wallet_address,path,size_bytes,shared_project_id,uploader_wallet) VALUES(wallet,object_path,p_size,p_project,actor)
    ON CONFLICT(path) DO UPDATE SET expires_at=now()+interval '3 hours';
  RETURN jsonb_build_object('path',object_path,'expiresAt',now()+interval '3 hours');
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_guard_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reservation public.editor_cloud_uploads; actual bigint; old_actual bigint;
BEGIN
  IF NEW.bucket_id IS DISTINCT FROM 'editor-project-media' THEN RETURN NEW; END IF;
  SELECT * INTO reservation FROM public.editor_cloud_uploads WHERE path=NEW.name;
  IF NOT FOUND OR reservation.expires_at<=now() THEN RAISE EXCEPTION 'Reserve cloud project media before upload'; END IF;
  IF reservation.shared_project_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||reservation.wallet_address,0));
    IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_projects p WHERE p.wallet_address=reservation.wallet_address
      AND p.id=reservation.shared_project_id AND p.trashed_at IS NULL AND (reservation.uploader_wallet=p.wallet_address OR EXISTS(
        SELECT 1 FROM public.editor_cloud_members m WHERE m.owner_wallet=p.wallet_address AND m.project_id=p.id
          AND m.member_wallet=reservation.uploader_wallet AND m.role='editor' AND m.accepted AND NOT m.revoked))) THEN
      RAISE EXCEPTION 'Project editing access is unavailable' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.metadata->>'size' IS NOT NULL AND NEW.metadata->>'size' !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid cloud media size'; END IF;
  actual:=coalesce((NEW.metadata->>'size')::bigint,0);
  IF actual>reservation.size_bytes THEN RAISE EXCEPTION 'Cloud media exceeds its upload reservation'; END IF;
  IF TG_OP='UPDATE' THEN
    old_actual:=coalesce((OLD.metadata->>'size')::bigint,0);
    IF old_actual>0 AND (NEW.name,NEW.bucket_id,NEW.metadata) IS DISTINCT FROM (OLD.name,OLD.bucket_id,OLD.metadata) THEN
      RAISE EXCEPTION 'Cloud project media is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.editor_cloud_shared_upload_allowed(p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.editor_cloud_wallet();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_uploads u WHERE u.path=p_path AND u.uploader_wallet=actor AND u.expires_at>now()
    AND public.editor_cloud_edit_allowed(u.wallet_address,u.shared_project_id));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_shared_upload_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_shared_upload_allowed(text) TO anon,authenticated;
CREATE POLICY editor_project_media_shared_upload ON storage.objects FOR INSERT TO anon,authenticated
  WITH CHECK(CASE WHEN bucket_id='editor-project-media' THEN public.editor_cloud_shared_upload_allowed(name) ELSE false END);

REVOKE ALL ON FUNCTION public.editor_cloud_edit_load(text,uuid),public.editor_cloud_edit_save(text,uuid,jsonb,integer,uuid),
  public.editor_cloud_prepare_shared_media(text,uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_edit_load(text,uuid),public.editor_cloud_edit_save(text,uuid,jsonb,integer,uuid),
  public.editor_cloud_prepare_shared_media(text,uuid,uuid,bigint,text) TO anon,authenticated;

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
  ) owners ORDER BY address LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||owner,0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud-inbox:'||w,0));
  -- Active and trashed projects cascade their own revisions and review rows.
  DELETE FROM public.editor_cloud_projects WHERE wallet_address=w;
  DELETE FROM public.editor_cloud_uploads WHERE wallet_address=w OR uploader_wallet=w;
  UPDATE public.editor_cloud_revisions SET editor_wallet='0x0000000000000000000000000000000000000000' WHERE editor_wallet=w;
  DELETE FROM public.editor_cloud_members WHERE member_wallet=w;
  UPDATE public.editor_cloud_comments SET
    author_wallet=CASE WHEN author_wallet=w THEN '0x0000000000000000000000000000000000000000' ELSE author_wallet END,
    body=CASE WHEN author_wallet=w THEN '[deleted]' ELSE body END,
    assignee_wallet=CASE WHEN assignee_wallet=w THEN NULL ELSE assignee_wallet END,
    state_version=state_version+1, updated_at=now()
    WHERE author_wallet=w OR assignee_wallet=w;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_editor_account_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_editor_account_data(text) TO service_role;


COMMIT;
