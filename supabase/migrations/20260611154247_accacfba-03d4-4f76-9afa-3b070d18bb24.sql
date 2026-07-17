
-- Allow community owners/admins to delete any message in their community
CREATE POLICY "Owners and admins can delete community chat messages"
ON public.community_chat_messages
FOR DELETE
USING (
  public.get_community_role(community_id, public.get_request_wallet_address()) = ANY (ARRAY['owner','admin'])
);

-- Allow community owners/admins to remove (kick) any member, but not themselves and not other owners
CREATE POLICY "Owners and admins can remove members"
ON public.community_members
FOR DELETE
USING (
  public.get_community_role(community_id, public.get_request_wallet_address()) = ANY (ARRAY['owner','admin'])
  AND role <> 'owner'
  AND lower(wallet_address) <> public.get_request_wallet_address()
);

-- Block banned members from sending new messages (existing INSERT policy already requires status='active', so banning to 'banned' is enough).
-- Block banned members from rejoining: prevent INSERT into community_members if a banned row exists.
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
CREATE POLICY "Users can join communities"
ON public.community_members
FOR INSERT
WITH CHECK (
  lower(wallet_address) = public.get_request_wallet_address()
  AND NOT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = community_members.community_id
      AND lower(cm.wallet_address) = public.get_request_wallet_address()
      AND cm.status = 'banned'
  )
);

-- Prevent a banned member from deleting (unbanning) their own row
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;
CREATE POLICY "Users can leave communities"
ON public.community_members
FOR DELETE
USING (
  lower(wallet_address) = public.get_request_wallet_address()
  AND status <> 'banned'
);
