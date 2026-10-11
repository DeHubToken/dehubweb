CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
CREATE TABLE wallet_auth.secret(id integer PRIMARY KEY,key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES(1,convert_to('community-fixture-only','UTF8'));
CREATE FUNCTION public.test_wallet(wallet text,expires bigint DEFAULT extract(epoch FROM now())::bigint+3600)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE payload text:=wallet||'.'||expires; signature text;
BEGIN
 SELECT encode(extensions.hmac(convert_to(payload,'UTF8'),key,'sha256'),'hex') INTO signature FROM wallet_auth.secret WHERE id=1;
 PERFORM set_config('request.headers',jsonb_build_object('x-wallet-address',wallet,'x-wallet-session',payload||'.'||signature)::text,true);
END $$;
CREATE TABLE public.communities(id uuid PRIMARY KEY,is_private boolean NOT NULL DEFAULT false,default_permissions jsonb DEFAULT '{"send_messages":true,"embed_links":true}'::jsonb);
CREATE TABLE public.community_members(community_id uuid REFERENCES public.communities(id),wallet_address text,role text DEFAULT 'member',status text DEFAULT 'active',permissions jsonb,muted_until timestamptz,banned_until timestamptz);
-- Existing production permission helpers are copied unchanged into this fixture.
CREATE OR REPLACE FUNCTION public.community_is_active_member(_community_id uuid, _wallet text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
     WHERE community_id = _community_id
       AND wallet_address = lower(coalesce(_wallet, ''))
       AND (
         status = 'active'
         -- an elapsed timed ban is not a ban; see community_permission
         OR (status = 'banned' AND banned_until IS NOT NULL AND banned_until <= now())
       )
  ) AND coalesce(_wallet, '') <> '';
$function$

CREATE OR REPLACE FUNCTION public.community_permission(_community_id uuid, _wallet text, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m         public.community_members%ROWTYPE;
  defaults  JSONB;
  raw       TEXT;
BEGIN
  IF coalesce(_wallet, '') = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO m
    FROM public.community_members
   WHERE community_id = _community_id
     AND wallet_address = lower(_wallet)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- A timed ban whose clock has run out is not a ban. Nothing sweeps the rows
  -- back to 'active', so expiry has to be resolved on read or every duration in
  -- the ban picker would silently mean "forever".
  IF m.status <> 'active'
     AND NOT (m.status = 'banned' AND m.banned_until IS NOT NULL AND m.banned_until <= now()) THEN
    RETURN false;
  END IF;

  -- The founder (and anyone ownership was transferred to) holds everything.
  IF m.role = 'owner' THEN
    RETURN true;
  END IF;

  IF m.role = 'admin' THEN
    -- Explicit admin grants win. Admins are exempt from mute and slow mode.
    raw := m.permissions ->> _perm;
    IF raw IN ('true', 'false') THEN
      RETURN raw = 'true';
    END IF;
  ELSE
    -- A muted member keeps read access but loses every posting right.
    IF m.muted_until IS NOT NULL
       AND m.muted_until > now()
       AND _perm IN ('send_messages', 'send_media', 'embed_links') THEN
      RETURN false;
    END IF;
  END IF;

  SELECT default_permissions INTO defaults
    FROM public.communities WHERE id = _community_id;

  raw := coalesce(defaults, '{}'::jsonb) ->> _perm;
  -- coalesce, not a bare comparison: a right that is absent from the blob makes
  -- ->> return NULL, and `NULL = 'true'` is NULL rather than false. This
  -- function must never return NULL -- community_assert tests `IF NOT ...`, and
  -- `NOT NULL` is NULL, which plpgsql treats as false and so skips the RAISE.
  -- That would let every admin-only right (none of which appear in the member
  -- defaults blob) fail open to any active member.
  RETURN coalesce(raw = 'true', false);
END;
$function$
