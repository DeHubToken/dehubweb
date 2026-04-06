
-- Allow event creators to manage RSVPs (approve/deny requests)
CREATE POLICY "Event creators can manage RSVPs"
ON public.community_event_rsvps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.community_events
    WHERE community_events.id = community_event_rsvps.event_id
    AND lower(community_events.creator_wallet_address) = get_request_wallet_address()
  )
);
