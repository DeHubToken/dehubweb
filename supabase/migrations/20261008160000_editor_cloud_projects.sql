BEGIN;

-- The existing editor_assets schema and signed-session key are observed live
-- dependencies. Do not invent missing historical migration ledger entries.
DO $$ BEGIN
  IF to_regclass('public.editor_assets') IS NULL OR to_regclass('wallet_auth.secret') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='editor_assets' AND column_name='provenance') THEN
    RAISE EXCEPTION 'Reconcile editor media and signed-session schema before adding cloud projects';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.editor_cloud_wallet() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE headers jsonb; parts text[]; secret_key bytea; claimed text;
BEGIN
  headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  parts:=string_to_array(headers->>'x-wallet-session','.');
  IF array_length(parts,1) IS DISTINCT FROM 3 OR parts[1] !~ '^0x[a-f0-9]{40}$'
     OR parts[2] !~ '^[0-9]{1,12}$' OR parts[3] !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Sign in again to access cloud projects' USING ERRCODE='42501';
  END IF;
  IF parts[2]::bigint <= extract(epoch FROM now()) THEN
    RAISE EXCEPTION 'Your cloud project session has expired' USING ERRCODE='42501';
  END IF;
  SELECT key INTO secret_key FROM wallet_auth.secret WHERE id=1;
  IF secret_key IS NULL OR encode(extensions.hmac(convert_to(parts[1]||'.'||parts[2],'UTF8'),secret_key,'sha256'),'hex') IS DISTINCT FROM parts[3] THEN
    RAISE EXCEPTION 'Invalid cloud project session' USING ERRCODE='42501';
  END IF;
  claimed:=lower(headers->>'x-wallet-address');
  IF claimed IS NOT NULL AND claimed<>parts[1] THEN
    RAISE EXCEPTION 'Cloud project account mismatch' USING ERRCODE='42501';
  END IF;
  RETURN parts[1];
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_wallet() TO anon,authenticated;

CREATE TABLE public.editor_cloud_projects (
  wallet_address text NOT NULL CHECK(wallet_address ~ '^0x[a-f0-9]{40}$'),
  id uuid NOT NULL,
  title text NOT NULL CHECK(length(title)<=200),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(wallet_address,id)
);
CREATE TABLE public.editor_cloud_revisions (
  wallet_address text NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  request_id uuid NOT NULL,
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(wallet_address,project_id,revision),
  UNIQUE(wallet_address,project_id,request_id),
  FOREIGN KEY(wallet_address,project_id) REFERENCES public.editor_cloud_projects(wallet_address,id) ON DELETE CASCADE
);
CREATE INDEX editor_cloud_projects_recent ON public.editor_cloud_projects(wallet_address,updated_at DESC);
ALTER TABLE public.editor_cloud_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editor_cloud_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editor_cloud_projects,public.editor_cloud_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.editor_cloud_projects,public.editor_cloud_revisions TO anon,authenticated;
GRANT ALL ON public.editor_cloud_projects,public.editor_cloud_revisions TO service_role;
CREATE POLICY editor_cloud_projects_owner_read ON public.editor_cloud_projects FOR SELECT TO anon,authenticated
  USING(wallet_address=(SELECT public.editor_cloud_wallet()));
CREATE POLICY editor_cloud_revisions_owner_read ON public.editor_cloud_revisions FOR SELECT TO anon,authenticated
  USING(wallet_address=(SELECT public.editor_cloud_wallet()));

-- Revision media has an independent lifecycle from the general media library.
-- No UPDATE/DELETE policy: older versions cannot be changed through an upload.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('editor-project-media','editor-project-media',false,1073741824);
CREATE TABLE public.editor_cloud_uploads (
  wallet_address text NOT NULL,
  path text PRIMARY KEY,
  size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=1073741824),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '3 hours'
);
ALTER TABLE public.editor_cloud_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editor_cloud_uploads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.editor_cloud_uploads TO service_role;
CREATE OR REPLACE FUNCTION public.editor_cloud_prepare_media(p_id uuid,p_size bigint,p_extension text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); object_path text; usage bigint; reserved bigint; existing public.editor_cloud_uploads;
BEGIN
  IF p_id IS NULL OR p_size IS NULL OR p_size<=0 OR p_size>1073741824 OR p_extension IS NULL OR p_extension !~ '^[a-z0-9]{1,5}$' THEN
    RAISE EXCEPTION 'Invalid cloud project media upload';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('editor-cloud:'||wallet,0));
  object_path:=wallet||'/'||p_id::text||'/source.'||p_extension;
  SELECT * INTO existing FROM public.editor_cloud_uploads WHERE path=object_path;
  IF FOUND AND existing.size_bytes<>p_size THEN RAISE EXCEPTION 'Cloud media is immutable; upload a new source'; END IF;
  SELECT coalesce(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END),0) INTO usage
    FROM storage.objects WHERE bucket_id='editor-project-media' AND split_part(name,'/',1)=wallet;
  SELECT coalesce(sum(u.size_bytes),0) INTO reserved FROM public.editor_cloud_uploads u
    WHERE u.wallet_address=wallet AND u.expires_at>now() AND u.path<>object_path
      AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='editor-project-media' AND o.name=u.path AND coalesce((o.metadata->>'size')::bigint,0)>0);
  IF usage+reserved+CASE WHEN EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media' AND name=object_path AND coalesce((metadata->>'size')::bigint,0)>0) THEN 0 ELSE p_size END>10737418240 THEN
    RAISE EXCEPTION 'Cloud project media storage is full';
  END IF;
  INSERT INTO public.editor_cloud_uploads(wallet_address,path,size_bytes) VALUES(wallet,object_path,p_size)
    ON CONFLICT(path) DO UPDATE SET expires_at=now()+interval '3 hours';
  RETURN jsonb_build_object('path',object_path,'expiresAt',now()+interval '3 hours');
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_prepare_media(uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_prepare_media(uuid,bigint,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.editor_cloud_guard_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reservation public.editor_cloud_uploads; actual bigint; old_actual bigint;
BEGIN
  IF NEW.bucket_id<>'editor-project-media' THEN RETURN NEW; END IF;
  SELECT * INTO reservation FROM public.editor_cloud_uploads WHERE path=NEW.name;
  IF NOT FOUND OR reservation.expires_at<=now() THEN RAISE EXCEPTION 'Reserve cloud project media before upload'; END IF;
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
REVOKE ALL ON FUNCTION public.editor_cloud_guard_media() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER editor_cloud_media_size_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.editor_cloud_guard_media();
CREATE POLICY editor_project_media_owner_read ON storage.objects FOR SELECT TO anon,authenticated
  USING(CASE WHEN bucket_id='editor-project-media' THEN split_part(name,'/',1)=public.editor_cloud_wallet() ELSE false END);
CREATE POLICY editor_project_media_owner_upload ON storage.objects FOR INSERT TO anon,authenticated
  WITH CHECK(CASE WHEN bucket_id='editor-project-media' THEN split_part(name,'/',1)=public.editor_cloud_wallet()
    AND name ~ '^0x[a-f0-9]{40}/[a-f0-9-]{36}/source\.[a-z0-9]{1,5}$' ELSE false END);

CREATE OR REPLACE FUNCTION public.editor_cloud_validate(p_document jsonb,p_project_id uuid,p_wallet text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; item jsonb; ids text[]; track_ids text[]; media_ids text[]; path text;
BEGIN
  IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>8388608
     OR p_document->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Invalid or oversized cloud project'; END IF;
  s:=p_document->'snapshot';
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'id' IS DISTINCT FROM p_project_id::text
     OR jsonb_typeof(s->'title') IS DISTINCT FROM 'string' OR length(s->>'title')>200
     OR jsonb_typeof(s->'tracks') IS DISTINCT FROM 'array' OR jsonb_typeof(s->'clips') IS DISTINCT FROM 'array'
     OR jsonb_typeof(s->'settings') IS DISTINCT FROM 'object' OR jsonb_typeof(p_document->'media') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid cloud project format';
  END IF;
  IF jsonb_array_length(s->'tracks')>200 OR jsonb_array_length(s->'clips')>10000 OR jsonb_array_length(p_document->'media')>2000 THEN
    RAISE EXCEPTION 'Cloud project has too many layers or sources';
  END IF;
  FOREACH path IN ARRAY ARRAY['width','height','fps'] LOOP
    IF jsonb_typeof(s->'settings'->path) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid canvas settings'; END IF;
    IF (s->'settings'->>path)::numeric<=0 OR (s->'settings'->>path)::numeric>16384 THEN RAISE EXCEPTION 'Invalid canvas settings'; END IF;
  END LOOP;
  SELECT coalesce(array_agg(value->>'id'),'{}') INTO track_ids FROM jsonb_array_elements(s->'tracks');
  SELECT coalesce(array_agg(value->>'id'),'{}') INTO media_ids FROM jsonb_array_elements(p_document->'media');
  FOR item IN SELECT value FROM jsonb_array_elements(s->'tracks') LOOP
    IF coalesce(item->>'id','')='' OR NOT coalesce(item->>'kind' IN ('video','audio','text'),false) THEN RAISE EXCEPTION 'Invalid track'; END IF;
  END LOOP;
  IF cardinality(track_ids)<>(SELECT count(DISTINCT x) FROM unnest(track_ids) x) OR cardinality(media_ids)<>(SELECT count(DISTINCT x) FROM unnest(media_ids) x) THEN
    RAISE EXCEPTION 'Duplicate cloud project source or track';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_document->'media') LOOP
    path:=item->>'storagePath';
    IF item->>'id' IS NULL OR item->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR NOT coalesce(item->>'kind' IN ('video','audio','image'),false)
       OR path IS NULL OR path !~ ('^'||p_wallet||'/'||(item->>'id')||'/source\.[a-z0-9]{1,5}$') THEN
      RAISE EXCEPTION 'Invalid cloud media reference';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='editor-project-media' AND name=path AND metadata->>'size' ~ '^[0-9]+$' AND (metadata->>'size')::numeric>0) THEN
      RAISE EXCEPTION 'Upload every project source before saving';
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(value->>'id'),'{}') INTO ids FROM jsonb_array_elements(s->'clips');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Duplicate clip'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(s->'clips') LOOP
    IF coalesce(item->>'id','')='' OR NOT coalesce((item->>'trackId')=ANY(track_ids),false)
       OR NOT coalesce(item->>'kind' IN ('video','audio','image','text','shape'),false) THEN RAISE EXCEPTION 'Invalid clip'; END IF;
    FOREACH path IN ARRAY ARRAY['start','duration','trimIn'] LOOP
      IF jsonb_typeof(item->path) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid clip time'; END IF;
      IF (item->>path)::numeric<0 OR (item->>path)::numeric>86400 THEN RAISE EXCEPTION 'Invalid clip time'; END IF;
    END LOOP;
    IF (item->>'duration')::numeric<=0 THEN RAISE EXCEPTION 'Invalid clip duration'; END IF;
    IF item->>'kind' IN ('video','audio','image') AND NOT coalesce((item->>'mediaId')=ANY(media_ids),false) THEN
      RAISE EXCEPTION 'Project source is missing';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.editor_cloud_validate(jsonb,uuid,text) FROM PUBLIC,anon,authenticated;

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
  SELECT coalesce(jsonb_agg(jsonb_build_object('projectId',id,'title',title,'revision',revision,'savedAt',updated_at) ORDER BY updated_at DESC,id),'[]'::jsonb)
  FROM public.editor_cloud_projects WHERE wallet_address=public.editor_cloud_wallet();
$$;
CREATE OR REPLACE FUNCTION public.editor_cloud_load(p_id uuid,p_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE wallet text:=public.editor_cloud_wallet(); result jsonb;
BEGIN
  SELECT jsonb_build_object('projectId',p.id,'revision',r.revision,'headRevision',p.revision,'savedAt',r.created_at,'document',r.document) INTO result
  FROM public.editor_cloud_projects p JOIN public.editor_cloud_revisions r ON r.wallet_address=p.wallet_address AND r.project_id=p.id
  WHERE p.wallet_address=wallet AND p.id=p_id AND r.revision=coalesce(p_revision,p.revision);
  IF result IS NULL THEN RAISE EXCEPTION 'Cloud project version was not found' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.editor_cloud_history(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('projectId',project_id,'revision',revision,'title',document->'snapshot'->>'title','savedAt',created_at) ORDER BY revision DESC),'[]'::jsonb)
  FROM public.editor_cloud_revisions WHERE wallet_address=public.editor_cloud_wallet() AND project_id=p_id;
$$;
CREATE OR REPLACE FUNCTION public.editor_cloud_restore(p_id uuid,p_revision integer,p_expected_revision integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source jsonb;
BEGIN
  source:=public.editor_cloud_load(p_id,p_revision)->'document';
  RETURN public.editor_cloud_save(p_id,source,p_expected_revision,p_request_id);
END $$;

REVOKE ALL ON FUNCTION public.editor_cloud_save(uuid,jsonb,integer,uuid),public.editor_cloud_list(),public.editor_cloud_load(uuid,integer),public.editor_cloud_history(uuid),public.editor_cloud_restore(uuid,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editor_cloud_save(uuid,jsonb,integer,uuid),public.editor_cloud_list(),public.editor_cloud_load(uuid,integer),public.editor_cloud_history(uuid),public.editor_cloud_restore(uuid,integer,integer,uuid) TO anon,authenticated;

COMMIT;
