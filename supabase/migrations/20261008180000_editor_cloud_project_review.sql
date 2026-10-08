BEGIN;

DO $$ BEGIN
  IF to_regclass('public.editor_cloud_projects') IS NULL
     OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='editor_cloud_projects' AND column_name='trashed_at') THEN
    RAISE EXCEPTION 'Apply cloud projects and recoverable Trash before project review';
  END IF;
END $$;

CREATE TABLE public.editor_cloud_members (
  owner_wallet text NOT NULL,
  project_id uuid NOT NULL,
  member_wallet text NOT NULL CHECK(member_wallet ~ '^0x[a-f0-9]{40}$' AND member_wallet<>owner_wallet),
  role text NOT NULL CHECK(role IN ('viewer','commenter')),
  accepted boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  state_version integer NOT NULL DEFAULT 1 CHECK(state_version>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_wallet,project_id,member_wallet),
  FOREIGN KEY(owner_wallet,project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE
);
CREATE INDEX editor_cloud_members_inbox ON public.editor_cloud_members(member_wallet,updated_at DESC) WHERE NOT revoked;
CREATE TABLE public.editor_cloud_comments (
  owner_wallet text NOT NULL,
  project_id uuid NOT NULL,
  id uuid NOT NULL,
  author_wallet text NOT NULL CHECK(author_wallet ~ '^0x[a-f0-9]{40}$'),
  revision integer NOT NULL,
  at_seconds numeric NOT NULL CHECK(at_seconds>=0 AND at_seconds<=86400),
  clip_id text,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000 AND body=btrim(body)),
  parent_id uuid,
  assignee_wallet text CHECK(assignee_wallet ~ '^0x[a-f0-9]{40}$'),
  resolved boolean NOT NULL DEFAULT false,
  state_version integer NOT NULL DEFAULT 1 CHECK(state_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_wallet,project_id,id),
  FOREIGN KEY(owner_wallet,project_id,revision) REFERENCES public.editor_cloud_revisions(wallet_address,project_id,revision) ON DELETE CASCADE,
  FOREIGN KEY(owner_wallet,project_id,parent_id) REFERENCES public.editor_cloud_comments(owner_wallet,project_id,id) ON DELETE CASCADE
);
CREATE INDEX editor_cloud_comments_thread ON public.editor_cloud_comments(owner_wallet,project_id,created_at,id);
CREATE INDEX editor_cloud_revision_media_lookup ON public.editor_cloud_revisions USING gin(document jsonb_path_ops);
ALTER TABLE public.editor_cloud_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_cloud_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editor_cloud_members,public.editor_cloud_comments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.editor_cloud_members,public.editor_cloud_comments TO anon,authenticated;
GRANT ALL ON public.editor_cloud_members,public.editor_cloud_comments TO service_role;

CREATE FUNCTION public.editor_cloud_review_allowed(p_owner text,p_id uuid,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_projects p WHERE p.wallet_address=p_owner AND p.id=p_id AND p.trashed_at IS NULL
    AND (p_owner=wallet OR EXISTS(SELECT 1 FROM public.editor_cloud_members m WHERE m.owner_wallet=p_owner AND m.project_id=p_id
      AND m.member_wallet=wallet AND m.accepted AND NOT m.revoked AND (NOT p_write OR m.role='commenter'))));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_review_allowed(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_review_allowed(text,uuid,boolean) TO anon,authenticated;
CREATE POLICY editor_cloud_members_participant_read ON public.editor_cloud_members FOR SELECT TO anon,authenticated
  USING(owner_wallet=(SELECT public.editor_cloud_wallet()) OR (member_wallet=(SELECT public.editor_cloud_wallet()) AND NOT revoked));
CREATE POLICY editor_cloud_comments_review_read ON public.editor_cloud_comments FOR SELECT TO anon,authenticated
  USING(public.editor_cloud_review_allowed(owner_wallet,project_id));

CREATE FUNCTION public.editor_cloud_review_member_json(p public.editor_cloud_members) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('ownerWallet',p.owner_wallet,'projectId',p.project_id,'memberWallet',p.member_wallet,
    'role',p.role,'accepted',p.accepted,'revoked',p.revoked,'stateVersion',p.state_version);
$$;
CREATE FUNCTION public.editor_cloud_review_comment_json(p public.editor_cloud_comments) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('id',p.id,'ownerWallet',p.owner_wallet,'projectId',p.project_id,'authorWallet',p.author_wallet,
    'revision',p.revision,'atSeconds',p.at_seconds,'clipId',p.clip_id,'body',p.body,'parentId',p.parent_id,
    'assigneeWallet',p.assignee_wallet,'resolved',p.resolved,'stateVersion',p.state_version,'createdAt',p.created_at,'updatedAt',p.updated_at);
$$;
REVOKE ALL ON FUNCTION public.editor_cloud_review_member_json(public.editor_cloud_members),public.editor_cloud_review_comment_json(public.editor_cloud_comments) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.editor_cloud_review_share(p_id uuid,p_member text,p_role text,p_expected_state integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); member text:=lower(p_member); previous public.editor_cloud_members; next_member public.editor_cloud_members;
BEGIN
  IF p_id IS NULL OR member IS NULL OR member !~ '^0x[a-f0-9]{40}$' OR member=wallet
    OR p_role IS NULL OR p_role NOT IN ('viewer','commenter','none') OR p_expected_state IS NULL OR p_expected_state<0 THEN
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
      accepted=CASE WHEN p_role='none' OR previous.revoked THEN false ELSE previous.accepted END,
      revoked=(p_role='none'),state_version=previous.state_version+1,updated_at=now()
    RETURNING * INTO next_member;
  RETURN public.editor_cloud_review_member_json(next_member);
END $$;

CREATE FUNCTION public.editor_cloud_review_accept(p_owner text,p_id uuid,p_expected_state integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); member public.editor_cloud_members;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_projects WHERE wallet_address=p_owner AND id=p_id AND trashed_at IS NULL) THEN
    RAISE EXCEPTION 'Cloud project is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO member FROM public.editor_cloud_members WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=wallet AND NOT revoked FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project invitation is unavailable' USING ERRCODE='42501'; END IF;
  IF member.accepted AND member.state_version=p_expected_state+1 THEN RETURN public.editor_cloud_review_member_json(member); END IF;
  IF p_expected_state IS NULL OR member.state_version<>p_expected_state THEN RAISE EXCEPTION 'Project invitation changed. Refresh before accepting.' USING ERRCODE='40001'; END IF;
  IF NOT member.accepted THEN
    UPDATE public.editor_cloud_members SET accepted=true,state_version=state_version+1,updated_at=now()
      WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=wallet RETURNING * INTO member;
  END IF;
  RETURN public.editor_cloud_review_member_json(member);
END $$;

CREATE FUNCTION public.editor_cloud_review_members(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.editor_cloud_projects WHERE wallet_address=wallet AND id=p_id AND trashed_at IS NULL) THEN
    RAISE EXCEPTION 'Cloud project is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(public.editor_cloud_review_member_json(m) ORDER BY m.updated_at DESC,m.member_wallet),'[]'::jsonb) INTO result
    FROM public.editor_cloud_members m WHERE m.owner_wallet=wallet AND m.project_id=p_id;
  RETURN result;
END $$;
CREATE FUNCTION public.editor_cloud_review_inbox() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(public.editor_cloud_review_member_json(m)||jsonb_build_object('title',p.title,'revision',p.revision,'savedAt',p.updated_at)
    ORDER BY m.updated_at DESC,p.id),'[]'::jsonb) INTO result
    FROM public.editor_cloud_members m JOIN public.editor_cloud_projects p ON p.wallet_address=m.owner_wallet AND p.id=m.project_id
    WHERE m.member_wallet=wallet AND NOT m.revoked AND p.trashed_at IS NULL;
  RETURN result;
END $$;
CREATE FUNCTION public.editor_cloud_review_load(p_owner text,p_id uuid,p_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.editor_cloud_review_allowed(p_owner,p_id) THEN RAISE EXCEPTION 'Project review is unavailable' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('projectId',p.id,'revision',r.revision,'headRevision',p.revision,'savedAt',r.created_at,'document',r.document) INTO result
    FROM public.editor_cloud_projects p JOIN public.editor_cloud_revisions r ON r.wallet_address=p.wallet_address AND r.project_id=p.id
    WHERE p.wallet_address=p_owner AND p.id=p_id AND r.revision=coalesce(p_revision,p.revision);
  IF result IS NULL THEN RAISE EXCEPTION 'Project version is unavailable' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.editor_cloud_review_media_allowed(p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet();
BEGIN
  RETURN EXISTS(SELECT 1 FROM public.editor_cloud_members m JOIN public.editor_cloud_projects p ON p.wallet_address=m.owner_wallet AND p.id=m.project_id
    JOIN public.editor_cloud_revisions r ON r.wallet_address=p.wallet_address AND r.project_id=p.id
    WHERE m.member_wallet=wallet AND m.accepted AND NOT m.revoked AND p.trashed_at IS NULL
      AND m.owner_wallet=split_part(p_path,'/',1) AND r.document @> jsonb_build_object('media',jsonb_build_array(jsonb_build_object('storagePath',p_path))));
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_review_media_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_review_media_allowed(text) TO anon,authenticated;
CREATE POLICY editor_project_media_reviewer_read ON storage.objects FOR SELECT TO anon,authenticated
  USING(CASE WHEN bucket_id='editor-project-media' THEN public.editor_cloud_review_media_allowed(name) ELSE false END);

CREATE FUNCTION public.editor_cloud_review_comments(p_owner text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.editor_cloud_review_allowed(p_owner,p_id) THEN RAISE EXCEPTION 'Project review is unavailable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(public.editor_cloud_review_comment_json(c) ORDER BY c.created_at,c.id),'[]'::jsonb) INTO result
    FROM public.editor_cloud_comments c WHERE c.owner_wallet=p_owner AND c.project_id=p_id;
  RETURN result;
END $$;
CREATE FUNCTION public.editor_cloud_review_comment(p_owner text,p_id uuid,p_comment_id uuid,p_revision integer,p_time numeric,p_body text,p_clip_id text DEFAULT NULL,p_parent_id uuid DEFAULT NULL,p_assignee text DEFAULT NULL) RETURNS jsonb
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
    SELECT 1 FROM public.editor_cloud_members WHERE owner_wallet=p_owner AND project_id=p_id AND member_wallet=p_assignee AND accepted AND NOT revoked AND role='commenter'))) THEN
    RAISE EXCEPTION 'Assign comments to an accepted project commenter';
  END IF;
  IF (SELECT count(*) FROM public.editor_cloud_comments WHERE owner_wallet=p_owner AND project_id=p_id)>=2000 THEN RAISE EXCEPTION 'Project comment limit reached'; END IF;
  INSERT INTO public.editor_cloud_comments(owner_wallet,project_id,id,author_wallet,revision,at_seconds,clip_id,body,parent_id,assignee_wallet)
    VALUES(p_owner,p_id,p_comment_id,wallet,p_revision,p_time,p_clip_id,btrim(p_body),p_parent_id,p_assignee) RETURNING * INTO existing;
  RETURN public.editor_cloud_review_comment_json(existing);
END $$;
CREATE FUNCTION public.editor_cloud_review_resolve(p_owner text,p_id uuid,p_comment_id uuid,p_expected_state integer,p_resolved boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); comment public.editor_cloud_comments;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||p_owner,0));
  IF NOT public.editor_cloud_review_allowed(p_owner,p_id,true) THEN RAISE EXCEPTION 'Comment access is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO comment FROM public.editor_cloud_comments WHERE owner_wallet=p_owner AND project_id=p_id AND id=p_comment_id FOR UPDATE;
  IF NOT FOUND OR comment.parent_id IS NOT NULL OR (wallet<>p_owner AND wallet<>comment.author_wallet AND wallet IS DISTINCT FROM comment.assignee_wallet) THEN
    RAISE EXCEPTION 'Only the owner, author or assignee can resolve this thread' USING ERRCODE='42501';
  END IF;
  IF p_expected_state IS NULL OR p_resolved IS NULL THEN RAISE EXCEPTION 'Invalid comment state'; END IF;
  IF comment.resolved=p_resolved AND comment.state_version=p_expected_state+1 THEN RETURN public.editor_cloud_review_comment_json(comment); END IF;
  IF comment.state_version<>p_expected_state THEN RAISE EXCEPTION 'This comment changed. Refresh before resolving.' USING ERRCODE='40001'; END IF;
  IF comment.resolved<>p_resolved THEN
    UPDATE public.editor_cloud_comments SET resolved=p_resolved,state_version=state_version+1,updated_at=now()
      WHERE owner_wallet=p_owner AND project_id=p_id AND id=p_comment_id RETURNING * INTO comment;
  END IF;
  RETURN public.editor_cloud_review_comment_json(comment);
END $$;

REVOKE ALL ON FUNCTION public.editor_cloud_review_share(uuid,text,text,integer),public.editor_cloud_review_accept(text,uuid,integer),
  public.editor_cloud_review_members(uuid),public.editor_cloud_review_inbox(),public.editor_cloud_review_load(text,uuid,integer),
  public.editor_cloud_review_comments(text,uuid),public.editor_cloud_review_comment(text,uuid,uuid,integer,numeric,text,text,uuid,text),
  public.editor_cloud_review_resolve(text,uuid,uuid,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_review_share(uuid,text,text,integer),public.editor_cloud_review_accept(text,uuid,integer),
  public.editor_cloud_review_members(uuid),public.editor_cloud_review_inbox(),public.editor_cloud_review_load(text,uuid,integer),
  public.editor_cloud_review_comments(text,uuid),public.editor_cloud_review_comment(text,uuid,uuid,integer,numeric,text,text,uuid,text),
  public.editor_cloud_review_resolve(text,uuid,uuid,integer,boolean) TO anon,authenticated;

COMMIT;
