-- A community share points at the original post; it never creates a new upload.
CREATE OR REPLACE FUNCTION public.community_post_wallet() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE headers jsonb; parts text[]; secret_key bytea; claimed text;
BEGIN
  headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  parts:=string_to_array(headers->>'x-wallet-session','.');
  IF array_length(parts,1) IS DISTINCT FROM 3 OR parts[1] !~ '^0x[a-f0-9]{40}$'
     OR parts[2] !~ '^[0-9]{1,12}$' OR parts[3] !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  IF parts[2]::bigint <= extract(epoch FROM now()) THEN RETURN NULL; END IF;
  SELECT key INTO secret_key FROM wallet_auth.secret WHERE id=1;
  IF secret_key IS NULL OR encode(extensions.hmac(convert_to(parts[1]||'.'||parts[2],'UTF8'),secret_key,'sha256'),'hex') IS DISTINCT FROM parts[3] THEN RETURN NULL; END IF;
  claimed:=lower(headers->>'x-wallet-address');
  IF claimed IS NOT NULL AND claimed<>parts[1] THEN RETURN NULL; END IF;
  RETURN parts[1];
END $$;
REVOKE ALL ON FUNCTION public.community_post_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_post_wallet() TO anon,authenticated;

CREATE TABLE public.community_post_shares (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  token_id bigint NOT NULL CHECK(token_id>0 AND token_id<=9007199254740991),
  shared_by text NOT NULL CHECK(shared_by ~ '^0x[a-f0-9]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(community_id,token_id)
);
CREATE INDEX community_post_shares_recent ON public.community_post_shares(community_id,created_at DESC,token_id DESC);
ALTER TABLE public.community_post_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_post_shares FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.community_post_shares TO anon,authenticated;
GRANT ALL ON public.community_post_shares TO service_role;

CREATE OR REPLACE FUNCTION public.community_posts_readable(_community_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.communities c WHERE c.id=_community_id AND
    (NOT c.is_private OR public.community_is_active_member(c.id,public.community_post_wallet())));
$$;
REVOKE ALL ON FUNCTION public.community_posts_readable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_posts_readable(uuid) TO anon,authenticated;
CREATE POLICY "Visible community post references" ON public.community_post_shares FOR SELECT TO anon,authenticated
  USING(public.community_posts_readable(community_id));

CREATE OR REPLACE FUNCTION public.community_share_post(_community_id uuid,_token_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.community_post_wallet();
BEGIN
  IF actor IS NULL OR NOT public.community_permission(_community_id,actor,'send_messages')
     OR NOT public.community_permission(_community_id,actor,'embed_links') THEN
    RAISE EXCEPTION 'You do not have permission to add posts here' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.community_post_shares(community_id,token_id,shared_by)
    VALUES(_community_id,_token_id,actor) ON CONFLICT(community_id,token_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.community_share_post(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_share_post(uuid,bigint) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.community_remove_shared_post(_community_id uuid,_token_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.community_post_wallet();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to manage shared posts' USING ERRCODE='42501'; END IF;
  DELETE FROM public.community_post_shares WHERE community_id=_community_id AND token_id=_token_id
    AND (shared_by=actor OR public.community_permission(_community_id,actor,'delete_messages'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Shared post not found or removal is not permitted' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.community_remove_shared_post(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_remove_shared_post(uuid,bigint) TO anon,authenticated;
