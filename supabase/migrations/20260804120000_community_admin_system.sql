-- =============================================================================
-- Community administration system
-- =============================================================================
-- Replaces the ad-hoc owner-only moderation with a real role ladder
-- (owner > admin > member), granular per-admin rights, per-member restrictions,
-- invite links and an admin action log.
--
-- Design note: every privileged write now goes through a SECURITY DEFINER RPC
-- rather than a table policy. Direct UPDATE on community_members / communities
-- is revoked outright, which removes the whole class of "policy checks the
-- caller but never the new row" escalations. It also gives us one place to
-- write the audit log from.
--
-- Caller identity still comes from get_request_wallet_address(), i.e. the
-- x-wallet-address request header. That header is not cryptographically
-- verified, so this hardening stops accidental and casual privilege abuse, not
-- a determined forger. When header auth is replaced by a signed session, only
-- get_request_wallet_address() changes -- every check below inherits it.
-- =============================================================================


-- ─── 1. Normalise wallet casing ──────────────────────────────────────────────
-- Rows were written with whatever casing the client held; every comparison in
-- the app lowercases, so mixed-case rows silently lost their creator controls.

UPDATE public.communities
   SET creator_wallet_address = lower(creator_wallet_address)
 WHERE creator_wallet_address <> lower(creator_wallet_address);

UPDATE public.community_members
   SET wallet_address = lower(wallet_address)
 WHERE wallet_address <> lower(wallet_address);

UPDATE public.community_chat_messages
   SET wallet_address = lower(wallet_address)
 WHERE wallet_address <> lower(wallet_address);

-- Deduplicate before the unique (wallet_address, community_id) pair collides.
DELETE FROM public.pinned_communities a
 USING public.pinned_communities b
 WHERE lower(a.wallet_address) = lower(b.wallet_address)
   AND a.community_id = b.community_id
   AND a.ctid > b.ctid;

UPDATE public.pinned_communities
   SET wallet_address = lower(wallet_address)
 WHERE wallet_address <> lower(wallet_address);

CREATE OR REPLACE FUNCTION public.lowercase_wallet_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'communities' THEN
    NEW.creator_wallet_address := lower(NEW.creator_wallet_address);
  ELSE
    NEW.wallet_address := lower(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lowercase_community_creator ON public.communities;
CREATE TRIGGER lowercase_community_creator
  BEFORE INSERT OR UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.lowercase_wallet_columns();

DROP TRIGGER IF EXISTS lowercase_community_member_wallet ON public.community_members;
CREATE TRIGGER lowercase_community_member_wallet
  BEFORE INSERT OR UPDATE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.lowercase_wallet_columns();

DROP TRIGGER IF EXISTS lowercase_community_message_wallet ON public.community_chat_messages;
CREATE TRIGGER lowercase_community_message_wallet
  BEFORE INSERT OR UPDATE ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.lowercase_wallet_columns();

DROP TRIGGER IF EXISTS lowercase_pinned_community_wallet ON public.pinned_communities;
CREATE TRIGGER lowercase_pinned_community_wallet
  BEFORE INSERT OR UPDATE ON public.pinned_communities
  FOR EACH ROW EXECUTE FUNCTION public.lowercase_wallet_columns();


-- ─── 2. Schema: roles, restrictions, group settings ──────────────────────────

ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS permissions   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_title  TEXT,
  ADD COLUMN IF NOT EXISTS muted_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ban_reason    TEXT,
  ADD COLUMN IF NOT EXISTS banned_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by  TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_by   TEXT;

-- role/status were free text: an unrecognised value silently conferred nothing.
UPDATE public.community_members SET role = 'member'
 WHERE role NOT IN ('owner', 'admin', 'member');
UPDATE public.community_members SET status = 'active'
 WHERE status NOT IN ('active', 'pending', 'banned');

ALTER TABLE public.community_members
  DROP CONSTRAINT IF EXISTS community_members_role_check,
  DROP CONSTRAINT IF EXISTS community_members_status_check;
ALTER TABLE public.community_members
  ADD CONSTRAINT community_members_role_check   CHECK (role   IN ('owner', 'admin', 'member')),
  ADD CONSTRAINT community_members_status_check CHECK (status IN ('active', 'pending', 'banned'));

CREATE INDEX IF NOT EXISTS idx_community_members_muted
  ON public.community_members (community_id, muted_until)
  WHERE muted_until IS NOT NULL;

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_permissions JSONB NOT NULL DEFAULT
    '{"send_messages":true,"send_media":true,"embed_links":true,"add_members":true,"pin_messages":false,"change_info":false,"create_events":true}'::jsonb;

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_slow_mode_check;
ALTER TABLE public.communities
  ADD CONSTRAINT communities_slow_mode_check
  CHECK (slow_mode_seconds >= 0 AND slow_mode_seconds <= 21600);

ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_community_chat_pinned
  ON public.community_chat_messages (community_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- Slow mode needs "when did this wallet last post here".
CREATE INDEX IF NOT EXISTS idx_community_chat_sender_recent
  ON public.community_chat_messages (community_id, wallet_address, created_at DESC);


-- ─── 3. Admin action log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_admin_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id          UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  actor_wallet_address  TEXT NOT NULL,
  action                TEXT NOT NULL,
  target_wallet_address TEXT,
  target_message_id     UUID,
  detail                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_admin_log_community
  ON public.community_admin_log (community_id, created_at DESC);

ALTER TABLE public.community_admin_log ENABLE ROW LEVEL SECURITY;


-- ─── 4. Invite links ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_invite_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT,
  created_by        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ,
  max_uses          INTEGER,
  uses              INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_invite_links_community
  ON public.community_invite_links (community_id, created_at DESC);

ALTER TABLE public.community_invite_links ENABLE ROW LEVEL SECURITY;


-- ─── 5. Permission resolution ────────────────────────────────────────────────
-- Admin rights:  change_info delete_messages restrict_members invite_users
--                pin_messages manage_events add_admins remain_anonymous
-- Member rights: send_messages send_media embed_links add_members
--                pin_messages change_info create_events

CREATE OR REPLACE FUNCTION public.community_is_active_member(_community_id UUID, _wallet TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.community_role_of(_community_id UUID, _wallet TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.community_members
   WHERE community_id = _community_id
     AND wallet_address = lower(coalesce(_wallet, ''))
     AND status = 'active'
     AND coalesce(_wallet, '') <> ''
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.community_permission(_community_id UUID, _wallet TEXT, _perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Raises unless the caller holds _perm. Returns the caller's wallet so the RPCs
-- can use it as the actor without re-reading the header.
CREATE OR REPLACE FUNCTION public.community_assert(_community_id UUID, _perm TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w TEXT;
BEGIN
  w := public.get_request_wallet_address();
  IF coalesce(w, '') = '' THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  -- IS NOT TRUE, not NOT: fails closed even if the predicate ever returns NULL.
  IF public.community_permission(_community_id, w, _perm) IS NOT TRUE THEN
    RAISE EXCEPTION 'permission_denied:%', _perm USING ERRCODE = '42501';
  END IF;
  RETURN w;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_log(
  _community_id UUID, _actor TEXT, _action TEXT,
  _target TEXT DEFAULT NULL, _message_id UUID DEFAULT NULL, _detail JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.community_admin_log
    (community_id, actor_wallet_address, action, target_wallet_address, target_message_id, detail)
  VALUES (_community_id, lower(_actor), _action, lower(_target), _message_id, coalesce(_detail, '{}'::jsonb));
$$;


-- ─── 6. Write guards ─────────────────────────────────────────────────────────
-- The RPCs below flip a transaction-local flag; the guards stand down for it.
-- Anything that did NOT come through an RPC is held to the self-service rules.

CREATE OR REPLACE FUNCTION public.community_privileged()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('dehub.community_privileged', true), '') = '1';
$$;

CREATE OR REPLACE FUNCTION public.community_members_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w         TEXT;
  isprivate BOOLEAN;
BEGIN
  IF public.community_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Every legitimate membership change now has an RPC. Direct UPDATE was the
    -- escalation path (promote self to owner, ban the founder) -- close it.
    RAISE EXCEPTION 'membership_updates_require_rpc' USING ERRCODE = '42501';
  END IF;

  w := public.get_request_wallet_address();

  IF lower(NEW.wallet_address) <> coalesce(w, '') THEN
    RAISE EXCEPTION 'cannot_join_on_behalf_of_another_wallet' USING ERRCODE = '42501';
  END IF;

  SELECT is_private INTO isprivate FROM public.communities WHERE id = NEW.community_id;

  -- role and status are server-decided, never client-supplied.
  NEW.role         := 'member';
  NEW.status       := CASE WHEN coalesce(isprivate, false) THEN 'pending' ELSE 'active' END;
  NEW.permissions  := '{}'::jsonb;
  NEW.custom_title := NULL;
  NEW.muted_until  := NULL;
  NEW.ban_reason   := NULL;
  NEW.banned_until := NULL;
  NEW.moderated_by := NULL;
  NEW.moderated_at := NULL;
  NEW.promoted_by  := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_members_guard_trigger ON public.community_members;
CREATE TRIGGER community_members_guard_trigger
  BEFORE INSERT OR UPDATE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_members_guard();

-- The creator bootstrap inserts an owner row, so it has to run privileged.
CREATE OR REPLACE FUNCTION public.auto_insert_community_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('dehub.community_privileged', '1', true);
  INSERT INTO public.community_members (community_id, wallet_address, role, status)
  VALUES (NEW.id, lower(NEW.creator_wallet_address), 'owner', 'active');
  PERFORM set_config('dehub.community_privileged', '0', true);
  RETURN NEW;
END;
$$;

-- Chat: stop members rewriting each other's messages. The old "members can
-- update reactions" policy had no column list, so it handed out content edits.
CREATE OR REPLACE FUNCTION public.community_chat_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w        TEXT;
  gap      INTEGER;
  lastpost TIMESTAMPTZ;
BEGIN
  -- Triggers are not bypassed by BYPASSRLS, so the service role has to be let
  -- through explicitly: the buy-alert bot and the AI admin both insert here with
  -- a service-role client, a sentinel wallet and no x-wallet-address header.
  -- PostgREST issues SET LOCAL role for service-key requests, and SECURITY
  -- DEFINER swaps current_user without rewriting that GUC.
  IF public.community_privileged()
     OR coalesce(current_setting('role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  w := public.get_request_wallet_address();
  IF coalesce(w, '') = '' THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF lower(NEW.wallet_address) <> w THEN
      RAISE EXCEPTION 'cannot_post_as_another_wallet' USING ERRCODE = '42501';
    END IF;
    IF public.community_permission(NEW.community_id, w, 'send_messages') IS NOT TRUE THEN
      RAISE EXCEPTION 'you_cannot_post_in_this_community' USING ERRCODE = '42501';
    END IF;
    IF NEW.image_url IS NOT NULL
       AND public.community_permission(NEW.community_id, w, 'send_media') IS NOT TRUE THEN
      RAISE EXCEPTION 'you_cannot_send_media_in_this_community' USING ERRCODE = '42501';
    END IF;

    -- Slow mode, owners and admins exempt.
    IF coalesce(public.community_role_of(NEW.community_id, w), 'member') = 'member' THEN
      SELECT slow_mode_seconds INTO gap FROM public.communities WHERE id = NEW.community_id;
      IF coalesce(gap, 0) > 0 THEN
        SELECT max(created_at) INTO lastpost
          FROM public.community_chat_messages
         WHERE community_id = NEW.community_id
           AND wallet_address = w;
        IF lastpost IS NOT NULL AND lastpost > now() - make_interval(secs => gap) THEN
          RAISE EXCEPTION 'slow_mode_active:%', gap USING ERRCODE = '53400';
        END IF;
      END IF;
    END IF;

    NEW.pinned_at := NULL;
    NEW.pinned_by := NULL;
    NEW.edited_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: `reactions` is the only column open to any active member. Everything
  -- else belongs to the author -- including the identity columns, which the chat
  -- paints straight off the row, so leaving display_name / avatar_url /
  -- badge_balance writable would let one member re-attribute another's message.
  IF lower(OLD.wallet_address) <> w THEN
    IF NEW.content       IS DISTINCT FROM OLD.content
       OR NEW.username      IS DISTINCT FROM OLD.username
       OR NEW.display_name  IS DISTINCT FROM OLD.display_name
       OR NEW.avatar_url    IS DISTINCT FROM OLD.avatar_url
       OR NEW.badge_balance IS DISTINCT FROM OLD.badge_balance
       OR NEW.edited_at     IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'cannot_edit_another_members_message' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.edited_at := now();
  ELSE
    -- edited_at is server-set; never take the client's word for it.
    NEW.edited_at := OLD.edited_at;
  END IF;

  IF NEW.pinned_at IS DISTINCT FROM OLD.pinned_at
     OR NEW.pinned_by IS DISTINCT FROM OLD.pinned_by THEN
    RAISE EXCEPTION 'pinning_requires_rpc' USING ERRCODE = '42501';
  END IF;

  IF NEW.wallet_address  IS DISTINCT FROM OLD.wallet_address
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
     OR NEW.image_url    IS DISTINCT FROM OLD.image_url
     OR NEW.message_type IS DISTINCT FROM OLD.message_type
     OR NEW.reply_to_id  IS DISTINCT FROM OLD.reply_to_id THEN
    RAISE EXCEPTION 'immutable_message_field' USING ERRCODE = '42501';
  END IF;

  IF NEW.reactions IS DISTINCT FROM OLD.reactions
     AND NOT public.community_is_active_member(NEW.community_id, w) THEN
    RAISE EXCEPTION 'only_members_can_react' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_chat_guard_trigger ON public.community_chat_messages;
CREATE TRIGGER community_chat_guard_trigger
  BEFORE INSERT OR UPDATE ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_chat_guard();


-- ─── 7. Membership RPCs ──────────────────────────────────────────────────────

-- Shared preconditions for acting on another member.
CREATE OR REPLACE FUNCTION public.community_target_guard(
  _community_id UUID, _actor TEXT, _target TEXT
)
RETURNS public.community_members
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.community_members%ROWTYPE;
BEGIN
  IF lower(coalesce(_target, '')) = lower(_actor) THEN
    RAISE EXCEPTION 'cannot_moderate_yourself' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO m FROM public.community_members
   WHERE community_id = _community_id AND wallet_address = lower(_target) LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF m.role = 'owner' THEN
    RAISE EXCEPTION 'cannot_moderate_the_owner' USING ERRCODE = '42501';
  END IF;

  -- Only the owner outranks an admin.
  IF m.role = 'admin'
     AND coalesce(public.community_role_of(_community_id, _actor), '') <> 'owner' THEN
    RAISE EXCEPTION 'only_the_owner_can_moderate_an_admin' USING ERRCODE = '42501';
  END IF;

  RETURN m;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_set_member_role(
  _community_id UUID,
  _target       TEXT,
  _role         TEXT,
  _permissions  JSONB DEFAULT NULL,
  _custom_title TEXT  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  m     public.community_members%ROWTYPE;
  perms JSONB := '{}'::jsonb;
  k     TEXT;
BEGIN
  IF _role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'role_must_be_admin_or_member' USING ERRCODE = '22023';
  END IF;

  actor := public.community_assert(_community_id, 'add_admins');
  m := public.community_target_guard(_community_id, actor, _target);

  IF m.status <> 'active' THEN
    RAISE EXCEPTION 'member_is_not_active' USING ERRCODE = '42501';
  END IF;

  IF _role = 'admin' THEN
    -- Whitelist: only known rights land in the blob, always as real booleans.
    FOREACH k IN ARRAY ARRAY[
      'change_info', 'delete_messages', 'restrict_members', 'invite_users',
      'pin_messages', 'manage_events', 'add_admins', 'remain_anonymous'
    ] LOOP
      IF coalesce(_permissions, '{}'::jsonb) ->> k = 'true' THEN
        perms := perms || jsonb_build_object(k, true);
      ELSE
        perms := perms || jsonb_build_object(k, false);
      END IF;
    END LOOP;

    -- An admin cannot mint an admin more powerful than itself.
    IF coalesce(public.community_role_of(_community_id, actor), '') <> 'owner' THEN
      FOREACH k IN ARRAY ARRAY[
        'change_info', 'delete_messages', 'restrict_members', 'invite_users',
        'pin_messages', 'manage_events', 'add_admins', 'remain_anonymous'
      ] LOOP
        IF perms ->> k = 'true'
           AND public.community_permission(_community_id, actor, k) IS NOT TRUE THEN
          perms := perms || jsonb_build_object(k, false);
        END IF;
      END LOOP;
    END IF;
  END IF;

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     SET role         = _role,
         permissions  = CASE WHEN _role = 'admin' THEN perms ELSE '{}'::jsonb END,
         custom_title = CASE WHEN _role = 'admin' THEN nullif(btrim(coalesce(_custom_title, '')), '') ELSE NULL END,
         promoted_by  = CASE WHEN _role = 'admin' THEN actor ELSE NULL END
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(
    _community_id, actor,
    CASE WHEN _role = 'admin' THEN 'promote_admin' ELSE 'demote_admin' END,
    _target, NULL,
    jsonb_build_object('permissions', perms, 'custom_title', _custom_title)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_transfer_ownership(_community_id UUID, _new_owner TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  m     public.community_members%ROWTYPE;
BEGIN
  actor := public.get_request_wallet_address();
  IF coalesce(public.community_role_of(_community_id, actor), '') <> 'owner' THEN
    RAISE EXCEPTION 'only_the_owner_can_transfer_ownership' USING ERRCODE = '42501';
  END IF;
  IF lower(coalesce(_new_owner, '')) = actor THEN
    RAISE EXCEPTION 'already_the_owner' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO m FROM public.community_members
   WHERE community_id = _community_id AND wallet_address = lower(_new_owner) LIMIT 1;
  IF NOT FOUND OR m.status <> 'active' THEN
    RAISE EXCEPTION 'new_owner_must_be_an_active_member' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('dehub.community_privileged', '1', true);

  UPDATE public.community_members
     SET role = 'admin',
         permissions = '{"change_info":true,"delete_messages":true,"restrict_members":true,"invite_users":true,"pin_messages":true,"manage_events":true,"add_admins":true,"remain_anonymous":false}'::jsonb,
         promoted_by = lower(_new_owner)
   WHERE community_id = _community_id AND wallet_address = actor;

  UPDATE public.community_members
     SET role = 'owner', permissions = '{}'::jsonb, custom_title = NULL,
         muted_until = NULL, ban_reason = NULL, banned_until = NULL
   WHERE community_id = _community_id AND wallet_address = lower(_new_owner);

  -- Keep the two definitions of "owner" from drifting apart. creator_wallet_address
  -- is what the storage policies and legacy reads key on.
  UPDATE public.communities
     SET creator_wallet_address = lower(_new_owner)
   WHERE id = _community_id;

  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'transfer_ownership', _new_owner);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_ban_member(
  _community_id UUID, _target TEXT, _reason TEXT DEFAULT NULL, _until TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');
  PERFORM public.community_target_guard(_community_id, actor, _target);

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     SET status = 'banned', role = 'member', permissions = '{}'::jsonb, custom_title = NULL,
         ban_reason = nullif(btrim(coalesce(_reason, '')), ''), banned_until = _until,
         muted_until = NULL, moderated_by = actor, moderated_at = now()
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'ban_member', _target, NULL,
    jsonb_build_object('reason', _reason, 'until', _until));
END;
$$;

CREATE OR REPLACE FUNCTION public.community_unban_member(_community_id UUID, _target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   TEXT;
  touched INTEGER;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     SET status = 'active', ban_reason = NULL, banned_until = NULL,
         moderated_by = actor, moderated_at = now()
   WHERE community_id = _community_id AND wallet_address = lower(_target)
     AND status = 'banned';
  GET DIAGNOSTICS touched = ROW_COUNT;
  PERFORM set_config('dehub.community_privileged', '0', true);

  IF touched = 0 THEN
    RAISE EXCEPTION 'member_is_not_banned' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.community_log(_community_id, actor, 'unban_member', _target);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_kick_member(_community_id UUID, _target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');
  PERFORM public.community_target_guard(_community_id, actor, _target);

  PERFORM set_config('dehub.community_privileged', '1', true);
  DELETE FROM public.community_members
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'kick_member', _target);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mute_member(
  _community_id UUID, _target TEXT, _until TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');
  PERFORM public.community_target_guard(_community_id, actor, _target);

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     -- A far-future finite date, not 'infinity': Postgres serialises infinity to
     -- the JSON string "infinity", and new Date("infinity") is NaN, so an
     -- indefinite mute would be invisible to every client-side check.
     SET muted_until = coalesce(_until, '9999-12-31T00:00:00Z'::timestamptz),
         moderated_by = actor, moderated_at = now()
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'mute_member', _target, NULL,
    jsonb_build_object('until', _until));
END;
$$;

CREATE OR REPLACE FUNCTION public.community_unmute_member(_community_id UUID, _target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     SET muted_until = NULL, moderated_by = actor, moderated_at = now()
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'unmute_member', _target);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_approve_member(_community_id UUID, _target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   TEXT;
  touched INTEGER;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_members
     SET status = 'active', moderated_by = actor, moderated_at = now()
   WHERE community_id = _community_id AND wallet_address = lower(_target)
     AND status = 'pending';
  GET DIAGNOSTICS touched = ROW_COUNT;
  PERFORM set_config('dehub.community_privileged', '0', true);

  IF touched = 0 THEN
    RAISE EXCEPTION 'no_pending_request' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.community_log(_community_id, actor, 'approve_member', _target);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_reject_member(_community_id UUID, _target TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   TEXT;
  touched INTEGER;
BEGIN
  actor := public.community_assert(_community_id, 'restrict_members');

  PERFORM set_config('dehub.community_privileged', '1', true);
  DELETE FROM public.community_members
   WHERE community_id = _community_id AND wallet_address = lower(_target)
     AND status = 'pending';
  GET DIAGNOSTICS touched = ROW_COUNT;
  PERFORM set_config('dehub.community_privileged', '0', true);

  IF touched = 0 THEN
    RAISE EXCEPTION 'no_pending_request' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.community_log(_community_id, actor, 'reject_member', _target);
END;
$$;


-- ─── 8. Content RPCs ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_delete_message(_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  msg   public.community_chat_messages%ROWTYPE;
BEGIN
  actor := public.get_request_wallet_address();
  IF coalesce(actor, '') = '' THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO msg FROM public.community_chat_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF lower(msg.wallet_address) <> actor THEN
    PERFORM public.community_assert(msg.community_id, 'delete_messages');
  END IF;

  PERFORM set_config('dehub.community_privileged', '1', true);
  DELETE FROM public.community_chat_messages WHERE id = _message_id;
  PERFORM set_config('dehub.community_privileged', '0', true);

  IF lower(msg.wallet_address) <> actor THEN
    PERFORM public.community_log(msg.community_id, actor, 'delete_message',
      msg.wallet_address, _message_id, jsonb_build_object('content', left(msg.content, 200)));
  END IF;
END;
$$;

-- Deletes every message a wallet has posted -- Telegram's "delete all messages
-- from this user", used alongside a ban.
CREATE OR REPLACE FUNCTION public.community_purge_member_messages(_community_id UUID, _target TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   TEXT;
  removed INTEGER;
BEGIN
  actor := public.community_assert(_community_id, 'delete_messages');

  PERFORM set_config('dehub.community_privileged', '1', true);
  DELETE FROM public.community_chat_messages
   WHERE community_id = _community_id AND wallet_address = lower(_target);
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(_community_id, actor, 'purge_messages', _target, NULL,
    jsonb_build_object('count', removed));
  RETURN removed;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_pin_message(_message_id UUID, _pinned BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  msg   public.community_chat_messages%ROWTYPE;
BEGIN
  SELECT * INTO msg FROM public.community_chat_messages WHERE id = _message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;

  actor := public.community_assert(msg.community_id, 'pin_messages');

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.community_chat_messages
     SET pinned_at = CASE WHEN _pinned THEN now() ELSE NULL END,
         pinned_by = CASE WHEN _pinned THEN actor ELSE NULL END
   WHERE id = _message_id;
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(msg.community_id, actor,
    CASE WHEN _pinned THEN 'pin_message' ELSE 'unpin_message' END,
    msg.wallet_address, _message_id);
END;
$$;


-- ─── 9. Community settings RPCs ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_update_settings(_community_id UUID, _patch JSONB)
RETURNS public.communities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor  TEXT;
  c_row  public.communities%ROWTYPE;
  perms  JSONB;
  k      TEXT;
BEGIN
  actor := public.community_assert(_community_id, 'change_info');

  -- change_info is also a *member* right ("Edit the community name and
  -- description"), so it cannot be the only gate on this function: it would let
  -- an owner who enables that toggle hand every member the ability to flip
  -- is_private, rewrite default_permissions, or disable slow mode. Cosmetic keys
  -- stay behind change_info alone; governance keys need rank as well.
  IF (_patch ? 'default_permissions' OR _patch ? 'is_private' OR _patch ? 'slow_mode_seconds')
     AND coalesce(public.community_role_of(_community_id, actor), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'permission_denied:change_info' USING ERRCODE = '42501';
  END IF;

  IF _patch ? 'default_permissions' THEN
    -- Start from what is stored and overlay only the whitelisted keys the patch
    -- actually carries. Rebuilding from scratch would turn any key the client
    -- omitted into a JSON null, which reads as "denied" — a partial map would
    -- silently switch off send_messages for the whole community.
    SELECT default_permissions INTO perms FROM public.communities WHERE id = _community_id;
    perms := coalesce(perms, '{}'::jsonb);
    FOREACH k IN ARRAY ARRAY[
      'send_messages', 'send_media', 'embed_links', 'add_members',
      'pin_messages', 'change_info', 'create_events'
    ] LOOP
      IF _patch -> 'default_permissions' ? k THEN
        perms := perms || jsonb_build_object(k, (_patch -> 'default_permissions' ->> k) = 'true');
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('dehub.community_privileged', '1', true);
  UPDATE public.communities SET
    name                    = coalesce(nullif(btrim(_patch ->> 'name'), ''), name),
    description             = CASE WHEN _patch ? 'description' THEN nullif(btrim(coalesce(_patch ->> 'description', '')), '') ELSE description END,
    avatar_url              = CASE WHEN _patch ? 'avatar_url'  THEN nullif(_patch ->> 'avatar_url', '')  ELSE avatar_url END,
    banner_url              = CASE WHEN _patch ? 'banner_url'  THEN nullif(_patch ->> 'banner_url', '')  ELSE banner_url END,
    is_private              = CASE WHEN _patch ? 'is_private'  THEN (_patch ->> 'is_private') = 'true'   ELSE is_private END,
    rules                   = CASE WHEN _patch ? 'rules'       THEN _patch -> 'rules'                    ELSE rules END,
    slow_mode_seconds       = CASE WHEN _patch ? 'slow_mode_seconds'
                                   THEN least(greatest(coalesce((_patch ->> 'slow_mode_seconds')::int, 0), 0), 21600)
                                   ELSE slow_mode_seconds END,
    default_permissions     = coalesce(perms, default_permissions),
    ticker_symbol           = CASE WHEN _patch ? 'ticker_symbol'           THEN nullif(_patch ->> 'ticker_symbol', '')           ELSE ticker_symbol END,
    ticker_contract_address = CASE WHEN _patch ? 'ticker_contract_address' THEN nullif(_patch ->> 'ticker_contract_address', '') ELSE ticker_contract_address END,
    ticker_chain_id         = CASE WHEN _patch ? 'ticker_chain_id'         THEN nullif(_patch ->> 'ticker_chain_id', '')         ELSE ticker_chain_id END,
    ticker_pair_address     = CASE WHEN _patch ? 'ticker_pair_address'     THEN nullif(_patch ->> 'ticker_pair_address', '')     ELSE ticker_pair_address END
  WHERE id = _community_id
  RETURNING * INTO c_row;
  PERFORM set_config('dehub.community_privileged', '0', true);

  -- Reopening a community should not strand the queue behind it.
  IF _patch ? 'is_private' AND (_patch ->> 'is_private') = 'false' THEN
    PERFORM set_config('dehub.community_privileged', '1', true);
    UPDATE public.community_members SET status = 'active'
     WHERE community_id = _community_id AND status = 'pending';
    PERFORM set_config('dehub.community_privileged', '0', true);
  END IF;

  PERFORM public.community_log(_community_id, actor, 'update_settings', NULL, NULL, _patch);
  RETURN c_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_delete(_community_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
BEGIN
  actor := public.get_request_wallet_address();
  IF coalesce(public.community_role_of(_community_id, actor), '') <> 'owner' THEN
    RAISE EXCEPTION 'only_the_owner_can_delete_a_community' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('dehub.community_privileged', '1', true);
  DELETE FROM public.communities WHERE id = _community_id;
  PERFORM set_config('dehub.community_privileged', '0', true);
END;
$$;


-- ─── 10. Invite link RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_create_invite(
  _community_id      UUID,
  _name              TEXT        DEFAULT NULL,
  _expires_at        TIMESTAMPTZ DEFAULT NULL,
  _max_uses          INTEGER     DEFAULT NULL,
  _requires_approval BOOLEAN     DEFAULT false
)
RETURNS public.community_invite_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor  TEXT;
  link   public.community_invite_links%ROWTYPE;
BEGIN
  actor := public.community_assert(_community_id, 'invite_users');

  INSERT INTO public.community_invite_links
    (community_id, code, name, created_by, expires_at, max_uses, requires_approval)
  VALUES (
    _community_id,
    -- 12 hex chars off a v4 uuid: URL-safe, and no pgcrypto dependency (this
    -- function pins search_path to public, where gen_random_bytes does not live).
    left(replace(gen_random_uuid()::text, '-', ''), 12),
    nullif(btrim(coalesce(_name, '')), ''),
    actor,
    _expires_at,
    CASE WHEN coalesce(_max_uses, 0) > 0 THEN _max_uses ELSE NULL END,
    coalesce(_requires_approval, false)
  )
  RETURNING * INTO link;

  PERFORM public.community_log(_community_id, actor, 'create_invite', NULL, NULL,
    jsonb_build_object('code', link.code, 'name', link.name, 'expires_at', _expires_at, 'max_uses', _max_uses));
  RETURN link;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_revoke_invite(_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  cid   UUID;
BEGIN
  SELECT community_id INTO cid FROM public.community_invite_links WHERE id = _invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0002';
  END IF;

  actor := public.community_assert(cid, 'invite_users');

  UPDATE public.community_invite_links SET revoked_at = now()
   WHERE id = _invite_id AND revoked_at IS NULL;

  PERFORM public.community_log(cid, actor, 'revoke_invite', NULL, NULL,
    jsonb_build_object('invite_id', _invite_id));
END;
$$;

-- Resolves a code without joining, so the landing page can show what you are
-- about to join. Deliberately readable by anyone holding the code.
-- Returns jsonb rather than a TABLE: the natural column names here collide with
-- the community columns they are selected from, which plpgsql rejects.
CREATE OR REPLACE FUNCTION public.community_preview_invite(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.community_invite_links%ROWTYPE;
  c   public.communities%ROWTYPE;
  bad TEXT := NULL;
BEGIN
  SELECT * INTO inv FROM public.community_invite_links WHERE code = _code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO c FROM public.communities WHERE id = inv.community_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'reason', 'not_found');
  END IF;

  IF inv.revoked_at IS NOT NULL THEN bad := 'revoked';
  ELSIF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN bad := 'expired';
  ELSIF inv.max_uses IS NOT NULL AND inv.uses >= inv.max_uses THEN bad := 'exhausted';
  END IF;

  RETURN jsonb_build_object(
    'is_valid',          bad IS NULL,
    'reason',            bad,
    'requires_approval', inv.requires_approval,
    'community_id',      c.id,
    'name',              c.name,
    'slug',              c.slug,
    'description',       c.description,
    'avatar_url',        c.avatar_url,
    'banner_url',        c.banner_url,
    'member_count',      c.member_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.community_join_via_invite(_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor    TEXT;
  inv      public.community_invite_links%ROWTYPE;
  existing public.community_members%ROWTYPE;
  newstatus TEXT;
BEGIN
  actor := public.get_request_wallet_address();
  IF coalesce(actor, '') = '' THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO inv FROM public.community_invite_links WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_revoked' USING ERRCODE = '42501';
  END IF;
  IF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE = '42501';
  END IF;
  IF inv.max_uses IS NOT NULL AND inv.uses >= inv.max_uses THEN
    RAISE EXCEPTION 'invite_exhausted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing FROM public.community_members
   WHERE community_id = inv.community_id AND wallet_address = actor;

  IF FOUND THEN
    IF existing.status = 'banned'
       AND (existing.banned_until IS NULL OR existing.banned_until > now()) THEN
      RAISE EXCEPTION 'you_are_banned_from_this_community' USING ERRCODE = '42501';
    END IF;
    -- An expired ban is cleared on contact rather than left as a tombstone.
    IF existing.status = 'banned' THEN
      PERFORM set_config('dehub.community_privileged', '1', true);
      UPDATE public.community_members
         SET status = 'active', ban_reason = NULL, banned_until = NULL
       WHERE id = existing.id;
      PERFORM set_config('dehub.community_privileged', '0', true);
      RETURN 'active';
    END IF;
    RETURN existing.status;
  END IF;

  -- An invite link is the admin's own vouching, so it overrides is_private
  -- unless the link itself was created as approval-required.
  newstatus := CASE WHEN inv.requires_approval THEN 'pending' ELSE 'active' END;

  PERFORM set_config('dehub.community_privileged', '1', true);
  INSERT INTO public.community_members (community_id, wallet_address, role, status)
  VALUES (inv.community_id, actor, 'member', newstatus);
  UPDATE public.community_invite_links SET uses = uses + 1 WHERE id = inv.id;
  PERFORM set_config('dehub.community_privileged', '0', true);

  PERFORM public.community_log(inv.community_id, inv.created_by, 'invite_used', actor, NULL,
    jsonb_build_object('code', inv.code, 'status', newstatus));
  RETURN newstatus;
END;
$$;


-- ─── 11. Row level security ──────────────────────────────────────────────────

-- communities: writes go through the RPCs above, which also stops member_count
-- from being client-writable.
DROP POLICY IF EXISTS "Creators can update their communities" ON public.communities;
DROP POLICY IF EXISTS "Creators can delete their communities" ON public.communities;

-- community_members: no direct UPDATE at all, and the owner may not walk away
-- from a community without transferring or deleting it first.
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.community_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.community_members;
DROP POLICY IF EXISTS "Anyone can view community members" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;

CREATE POLICY "Users can leave communities"
  ON public.community_members FOR DELETE
  USING (
    wallet_address = public.get_request_wallet_address()
    AND status <> 'banned'
    AND role <> 'owner'
  );

-- Re-stated from 20260611154247 so that a ban whose duration has elapsed stops
-- blocking the rejoin. Without the expiry term every timed ban is permanent.
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
CREATE POLICY "Users can join communities"
  ON public.community_members FOR INSERT
  WITH CHECK (
    wallet_address = public.get_request_wallet_address()
    AND NOT EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.community_id = community_members.community_id
         AND cm.wallet_address = public.get_request_wallet_address()
         AND cm.status = 'banned'
         AND (cm.banned_until IS NULL OR cm.banned_until > now())
    )
  );

-- Self-drop as well as dropping the superseded names above: without it a
-- re-run of this migration fails on the policy it created itself.
DROP POLICY IF EXISTS "View community members" ON public.community_members;
CREATE POLICY "View community members"
  ON public.community_members FOR SELECT
  USING (
    -- always your own row, so pending/banned states stay legible to you
    wallet_address = public.get_request_wallet_address()
    -- the active roster of a public community is public
    OR (
      status = 'active'
      AND NOT coalesce((SELECT c.is_private FROM public.communities c WHERE c.id = community_id), false)
    )
    -- inside a private community, members see each other
    OR (
      status = 'active'
      AND public.community_is_active_member(community_id, public.get_request_wallet_address())
    )
    -- the queue and the ban list are for moderators only
    OR public.community_permission(community_id, public.get_request_wallet_address(), 'restrict_members')
  );

-- community_chat_messages: a private community's history is no longer world
-- readable, and all mutations funnel through the guard/RPCs.
DROP POLICY IF EXISTS "Anyone can view community chat messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Members can update reactions on community chat" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Users can update own community chat messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Owners and admins can delete community chat messages" ON public.community_chat_messages;
DROP POLICY IF EXISTS "Users can delete own community chat messages" ON public.community_chat_messages;

DROP POLICY IF EXISTS "View community chat messages" ON public.community_chat_messages;
CREATE POLICY "View community chat messages"
  ON public.community_chat_messages FOR SELECT
  USING (
    NOT coalesce((SELECT c.is_private FROM public.communities c WHERE c.id = community_id), false)
    OR public.community_is_active_member(community_id, public.get_request_wallet_address())
  );

DROP POLICY IF EXISTS "Members can update community chat messages" ON public.community_chat_messages;
CREATE POLICY "Members can update community chat messages"
  ON public.community_chat_messages FOR UPDATE
  USING (public.community_is_active_member(community_id, public.get_request_wallet_address()))
  WITH CHECK (public.community_is_active_member(community_id, public.get_request_wallet_address()));

CREATE POLICY "Users can delete own community chat messages"
  ON public.community_chat_messages FOR DELETE
  USING (wallet_address = public.get_request_wallet_address());

-- admin log: moderators only.
DROP POLICY IF EXISTS "Moderators can read the admin log" ON public.community_admin_log;
CREATE POLICY "Moderators can read the admin log"
  ON public.community_admin_log FOR SELECT
  USING (public.community_permission(community_id, public.get_request_wallet_address(), 'restrict_members'));

-- invite links: only the people who can create them can list them. Joining
-- happens through community_join_via_invite, which needs no read access.
DROP POLICY IF EXISTS "Inviters can read invite links" ON public.community_invite_links;
CREATE POLICY "Inviters can read invite links"
  ON public.community_invite_links FOR SELECT
  USING (public.community_permission(community_id, public.get_request_wallet_address(), 'invite_users'));


-- ─── 12. Storage ─────────────────────────────────────────────────────────────
-- Was: anyone, including anon, could overwrite or delete any community's avatar
-- and banner. The object paths are '<slug>/<type>_<ts>.<ext>' and are embedded
-- in the public URL, so "guess the path" was not even required.
--
-- The fix is asymmetric on purpose. Storage requests go through the storage API,
-- which has no way to carry the x-wallet-address header the RLS helpers read --
-- so an ownership predicate here would deny every upload, including the one the
-- create-community flow makes before the community row exists. Instead:
--   INSERT stays open, because a new object at a fresh timestamped path is inert
--   until community_update_settings (which does require change_info) attaches
--   its URL to a community;
--   UPDATE and DELETE are removed outright, which is what actually protects the
--   live branding. Both clients always upload to a new unique path, so neither
--   needs them.

DROP POLICY IF EXISTS "Anyone can upload community media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update community media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete community media" ON storage.objects;

CREATE POLICY "Anyone can upload community media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-media');

-- Keep the open bucket from becoming a general-purpose dumping ground.
UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 WHERE id = 'community-media';


-- ─── 13. Grants ──────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.community_permission(UUID, TEXT, TEXT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_is_active_member(UUID, TEXT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_role_of(UUID, TEXT)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_set_member_role(UUID, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_transfer_ownership(UUID, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_ban_member(UUID, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_unban_member(UUID, TEXT)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_kick_member(UUID, TEXT)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_mute_member(UUID, TEXT, TIMESTAMPTZ)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_unmute_member(UUID, TEXT)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_approve_member(UUID, TEXT)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_reject_member(UUID, TEXT)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_delete_message(UUID)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_purge_member_messages(UUID, TEXT)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_pin_message(UUID, BOOLEAN)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_update_settings(UUID, JSONB)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_delete(UUID)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_create_invite(UUID, TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_revoke_invite(UUID)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_preview_invite(TEXT)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_join_via_invite(TEXT)                 TO anon, authenticated;

GRANT SELECT ON public.community_admin_log     TO anon, authenticated;
GRANT SELECT ON public.community_invite_links  TO anon, authenticated;


-- ─── 14. Backfill ────────────────────────────────────────────────────────────
-- Existing communities predate the owner row convention in two ways: some have
-- no owner row at all (the trigger was added after the first rows), and some
-- have an owner row whose wallet no longer matches creator_wallet_address.

DO $$
DECLARE
  c RECORD;
BEGIN
  PERFORM set_config('dehub.community_privileged', '1', true);

  FOR c IN SELECT id, creator_wallet_address FROM public.communities LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.community_members
       WHERE community_id = c.id AND role = 'owner' AND status = 'active'
    ) THEN
      INSERT INTO public.community_members (community_id, wallet_address, role, status)
      VALUES (c.id, lower(c.creator_wallet_address), 'owner', 'active')
      ON CONFLICT (community_id, wallet_address)
      DO UPDATE SET role = 'owner', status = 'active';
    END IF;
  END LOOP;

  PERFORM set_config('dehub.community_privileged', '0', true);
END;
$$;
