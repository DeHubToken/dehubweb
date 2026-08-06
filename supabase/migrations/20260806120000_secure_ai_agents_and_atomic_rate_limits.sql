-- ============================================================================
-- 1. Record who actually owns an agent
-- ============================================================================
-- The four owner-scoped policies on this table all read
--
--   LOWER(owner_wallet_address) = public.get_request_wallet_address()
--
-- but owner_wallet_address holds the wallet the *agent* was given at
-- registration, not the human's. The human went into metadata->>'human_owner',
-- which is set on 1 of the 18 existing rows. So those policies match nobody and
-- have never done anything: /app/agents only lists agents because the
-- world-open policy dropped in step 2 lets every caller read every row.
--
-- Fixing the world-open policy without fixing this would empty the page and
-- turn Delete into a silent no-op, so ownership gets a real column first.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS human_owner_wallet text;

UPDATE public.ai_agents
SET human_owner_wallet = LOWER(metadata->>'human_owner')
WHERE human_owner_wallet IS NULL
  AND metadata->>'human_owner' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agents_human_owner
  ON public.ai_agents(human_owner_wallet);

COMMENT ON COLUMN public.ai_agents.human_owner_wallet IS
  'Wallet of the person who created the agent. owner_wallet_address is the agent''s own generated wallet and is not an ownership claim.';

-- The seeded template agents predate any of this and have no human owner. They
-- stay publicly listable (the home-feed stories read them) but unmanageable,
-- which is correct — nobody can claim them.

-- ============================================================================
-- 2. Close public write access to ai_agents
-- ============================================================================
-- The original policy was written as a service-role escape hatch:
--
--   CREATE POLICY "Service role full access agents" ON public.ai_agents
--     FOR ALL USING (true);
--
-- It has no TO clause, so it applies to PUBLIC. RLS policies are permissive and
-- OR'd together, which means this one alone granted anon full SELECT, UPDATE
-- and DELETE on every row. The table stores each agent's api_key and
-- wallet_private_key in plain text, so anyone holding the anon key that ships
-- in the web bundle could read every agent's signing key.
--
-- The service role bypasses RLS regardless, so scoping the policy costs nothing.

DROP POLICY IF EXISTS "Service role full access agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Service role full access rate limits" ON public.ai_agent_rate_limits;

CREATE POLICY "Service role full access agents" ON public.ai_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access rate limits" ON public.ai_agent_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Point the owner policies at the column that means ownership. Registration is
-- done by the edge function under the service role, so there is no client
-- INSERT path left to keep.

DROP POLICY IF EXISTS "Users can view their own agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Users can create agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON public.ai_agents;

-- Listing agents is public: the home-feed stories resolve template agents to
-- wallet addresses with no wallet header, and agent profiles are public on
-- DeHub anyway. This is only safe because step 3 revokes the key columns from
-- client roles, so "every row" cannot mean "every secret".
CREATE POLICY "Agents are publicly listable" ON public.ai_agents
  FOR SELECT USING (true);

-- get_request_wallet_address() returns '' when the header is absent, never
-- NULL, so the emptiness check has to be explicit or an unauthenticated caller
-- would match any row whose owner column is also empty.
CREATE POLICY "Owners can update their own agents" ON public.ai_agents
  FOR UPDATE
  USING (
    public.get_request_wallet_address() <> ''
    AND LOWER(human_owner_wallet) = public.get_request_wallet_address()
  )
  WITH CHECK (
    public.get_request_wallet_address() <> ''
    AND LOWER(human_owner_wallet) = public.get_request_wallet_address()
  );

CREATE POLICY "Owners can delete their own agents" ON public.ai_agents
  FOR DELETE
  USING (
    public.get_request_wallet_address() <> ''
    AND LOWER(human_owner_wallet) = public.get_request_wallet_address()
  );

-- ============================================================================
-- 3. Put the secrets out of reach of client roles entirely
-- ============================================================================
-- Column privileges are evaluated before RLS and cannot be spoofed by the
-- unsigned wallet header, so they carry the weight here. api_key is revoked
-- alongside wallet_private_key: with a public SELECT policy in place, a granted
-- api_key column would be a public key dump. Owners read their own keys through
-- get_my_agents() below instead.
--
-- A table-level grant covers every column, so it has to be revoked before
-- per-column grants mean anything.

REVOKE SELECT, INSERT, UPDATE ON public.ai_agents FROM anon, authenticated;

GRANT SELECT (
  id, name, description, owner_wallet_address, human_owner_wallet,
  is_active, last_active_at, created_at, updated_at
) ON public.ai_agents TO anon, authenticated;

-- Owners rename and deactivate their agents from /app/agents. They never write
-- the key columns, and metadata is server-owned.
GRANT UPDATE (name, description, is_active) ON public.ai_agents TO anon, authenticated;

-- Only the edge function touches the counters.
REVOKE ALL ON public.ai_agent_rate_limits FROM anon, authenticated;

-- ============================================================================
-- 4. Scrub live bearer tokens out of metadata
-- ============================================================================
-- Registration used to stash the agent's DeHub auth token in metadata. The edge
-- function mints a fresh token per session now, so the stored copies are pure
-- liability.

UPDATE public.ai_agents
SET metadata = metadata - 'dehub_auth_token'
WHERE metadata ? 'dehub_auth_token';

-- ============================================================================
-- 5. Let an owner read back their own keys
-- ============================================================================
-- api_key is no longer selectable by client roles, so /app/agents gets it from
-- here. Gated on get_request_wallet_address(), which is exactly as trustworthy
-- as the policies it replaces — no better, but the blast radius is now one
-- caller's own rows rather than the whole table.

CREATE OR REPLACE FUNCTION public.get_my_agents()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  api_key text,
  owner_wallet_address text,
  is_active boolean,
  last_active_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.description, a.api_key, a.owner_wallet_address,
         a.is_active, a.last_active_at, a.created_at
  FROM public.ai_agents a
  WHERE public.get_request_wallet_address() <> ''
    AND LOWER(a.human_owner_wallet) = public.get_request_wallet_address()
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_agents() TO anon, authenticated, service_role;

-- ============================================================================
-- 6. Atomic rate limiting
-- ============================================================================
-- The edge function read the counter, compared it, then wrote it back. Two
-- concurrent tool calls both read the same count and both proceed, so the
-- limits leaked under exactly the load they exist to cap. One statement with
-- ON CONFLICT does the whole thing under the row lock.

CREATE OR REPLACE FUNCTION public.consume_agent_rate_limit(
  p_agent_id uuid,
  p_action_type text,
  p_limit integer,
  p_window_ms bigint
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_count integer;
  v_start timestamptz;
BEGIN
  INSERT INTO public.ai_agent_rate_limits AS rl (agent_id, action_type, count, window_start)
  VALUES (p_agent_id, p_action_type, 1, now())
  ON CONFLICT (agent_id, action_type) DO UPDATE
    SET count = CASE
          WHEN rl.window_start < now() - v_window THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.window_start < now() - v_window THEN now()
          ELSE rl.window_start
        END
  RETURNING rl.count, rl.window_start INTO v_count, v_start;

  RETURN QUERY SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    v_start + v_window;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_agent_rate_limit(uuid, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_agent_rate_limit(uuid, text, integer, bigint) TO service_role;

COMMENT ON FUNCTION public.consume_agent_rate_limit(uuid, text, integer, bigint) IS
  'Atomically consumes one unit of an agent''s rate-limit budget and reports whether the call is allowed.';
