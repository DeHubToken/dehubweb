-- On a private event a guest's RSVP row is also their place on the guest list,
-- so only the event creator may set it to approved or denied ("Event creators
-- can manage RSVPs", unchanged). A guest may request a place (pending) and
-- withdraw a pending request, nothing else: an approved or denied row can no
-- longer be rewritten or deleted by its guest, which also stops old clients
-- that toggle Going/Interested from dropping an approved guest's approval.
-- Clients read a legacy 'going' row on a private event as approved; it is
-- covered by the same rule. Public events keep going/interested/remove, and
-- the creator's own row on their own event is not restricted.

ALTER TABLE public.community_event_rsvps
  ADD CONSTRAINT community_event_rsvps_status_check
  CHECK (status IN ('going', 'interested', 'pending', 'approved', 'denied'));

DROP POLICY IF EXISTS "Users can create their own RSVP" ON public.community_event_rsvps;
CREATE POLICY "Users can create their own RSVP"
  ON public.community_event_rsvps
  FOR INSERT
  WITH CHECK (
    lower(wallet_address) = get_request_wallet_address()
    AND EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_rsvps.event_id
        AND CASE
          WHEN e.is_private AND lower(e.creator_wallet_address) <> get_request_wallet_address()
            THEN community_event_rsvps.status = 'pending'
          ELSE community_event_rsvps.status IN ('going', 'interested')
        END
    )
  );

DROP POLICY IF EXISTS "Users can update their own RSVP" ON public.community_event_rsvps;
CREATE POLICY "Users can update their own RSVP"
  ON public.community_event_rsvps
  FOR UPDATE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    AND EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_rsvps.event_id
        AND (
          NOT e.is_private
          OR lower(e.creator_wallet_address) = get_request_wallet_address()
          OR community_event_rsvps.status = 'pending'
        )
    )
  )
  WITH CHECK (
    lower(wallet_address) = get_request_wallet_address()
    AND EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_rsvps.event_id
        AND CASE
          WHEN e.is_private AND lower(e.creator_wallet_address) <> get_request_wallet_address()
            THEN community_event_rsvps.status = 'pending'
          ELSE community_event_rsvps.status IN ('going', 'interested')
        END
    )
  );

DROP POLICY IF EXISTS "Users can delete their own RSVP" ON public.community_event_rsvps;
CREATE POLICY "Users can delete their own RSVP"
  ON public.community_event_rsvps
  FOR DELETE
  USING (
    lower(wallet_address) = get_request_wallet_address()
    AND EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_rsvps.event_id
        AND (
          NOT e.is_private
          OR lower(e.creator_wallet_address) = get_request_wallet_address()
          OR community_event_rsvps.status = 'pending'
        )
    )
  );
