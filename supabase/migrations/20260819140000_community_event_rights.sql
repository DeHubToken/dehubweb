-- Community events obey the community's permission model
-- ======================================================
-- `manage_events` and `create_events` have been grantable since the admin
-- system landed -- the first is a switch in the promote-an-admin dialog, the
-- second sits in the member-rights map -- but community_events still carried
-- the policies it was born with. UPDATE and DELETE were creator-only, so an
-- admin handed "Manage events" could not touch a single event and neither
-- could the owner; INSERT checked nothing beyond "you stamped your own wallet
-- on it", so a non-member, a muted member or a banned member could file an
-- event into any community.
--
-- community_permission() already resolves all of that: it returns false for a
-- non-member and for anyone whose row is not active, it lets the owner through
-- unconditionally, and it falls back to the community's default_permissions
-- for a plain member. An event with no community_id belongs to nobody, so it
-- keeps the old creator-only rules.
--
-- Re-runnable, like the migration that introduced the admin system.

-- Who may file an event ------------------------------------------------------
DROP POLICY IF EXISTS "Users can create events"           ON public.community_events;
DROP POLICY IF EXISTS "Members can create community events" ON public.community_events;

CREATE POLICY "Members can create community events"
  ON public.community_events FOR INSERT
  WITH CHECK (
    lower(creator_wallet_address) = public.get_request_wallet_address()
    AND (
      community_id IS NULL
      OR public.community_permission(
           community_id, public.get_request_wallet_address(), 'create_events')
    )
  );

-- Who may edit one -----------------------------------------------------------
-- The WITH CHECK mirrors the INSERT rule rather than repeating the USING one:
-- it is what stops an edit from reassigning the creator, or from moving an
-- event into a community the editor could not have posted it to.
DROP POLICY IF EXISTS "Creators can update their events"            ON public.community_events;
DROP POLICY IF EXISTS "Creators and event managers can update events" ON public.community_events;

CREATE POLICY "Creators and event managers can update events"
  ON public.community_events FOR UPDATE
  USING (
    lower(creator_wallet_address) = public.get_request_wallet_address()
    OR (
      community_id IS NOT NULL
      AND public.community_permission(
            community_id, public.get_request_wallet_address(), 'manage_events')
    )
  )
  WITH CHECK (
    (
      lower(creator_wallet_address) = public.get_request_wallet_address()
      AND (
        community_id IS NULL
        OR public.community_permission(
             community_id, public.get_request_wallet_address(), 'create_events')
      )
    )
    OR (
      community_id IS NOT NULL
      AND public.community_permission(
            community_id, public.get_request_wallet_address(), 'manage_events')
    )
  );

-- Who may remove one ---------------------------------------------------------
DROP POLICY IF EXISTS "Creators can delete their events"            ON public.community_events;
DROP POLICY IF EXISTS "Creators and event managers can delete events" ON public.community_events;

CREATE POLICY "Creators and event managers can delete events"
  ON public.community_events FOR DELETE
  USING (
    lower(creator_wallet_address) = public.get_request_wallet_address()
    OR (
      community_id IS NOT NULL
      AND public.community_permission(
            community_id, public.get_request_wallet_address(), 'manage_events')
    )
  );
