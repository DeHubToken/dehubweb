-- The community_members INSERT policy used to query community_members directly
-- to check for a banned row. Because RLS applies to that subquery too, Postgres
-- recursively re-entered the same policy and rejected every join.
--
-- Keep the ban check behind a narrowly-scoped SECURITY DEFINER function. The
-- function owner performs the lookup without re-entering the caller's RLS
-- policy, while the policy still verifies that the submitted wallet is the
-- wallet carried by the request.
CREATE OR REPLACE FUNCTION public.is_banned_from_community(
  _community_id uuid,
  _wallet_address text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_id = _community_id
      AND lower(wallet_address) = lower(_wallet_address)
      AND status = 'banned'
  );
$$;

REVOKE ALL ON FUNCTION public.is_banned_from_community(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_banned_from_community(uuid, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;

CREATE POLICY "Users can join communities"
ON public.community_members
FOR INSERT
WITH CHECK (
  lower(wallet_address) = public.get_request_wallet_address()
  AND NOT public.is_banned_from_community(
    community_id,
    public.get_request_wallet_address()
  )
);
