-- ============================================================================
-- 1. Close public read/write access to ai_agents
-- ============================================================================
-- The original policy was written as a service-role escape hatch:
--
--   CREATE POLICY "Service role full access agents" ON public.ai_agents
--     FOR ALL USING (true);
--
-- It has no TO clause, so it applies to PUBLIC. RLS policies are permissive and
-- OR'd together, which means this one alone granted anon full SELECT, UPDATE
-- and DELETE on every row and made the four wallet-scoped policies above it
-- inert. The table stores each agent's api_key and wallet_private_key in plain
-- text, so anyone holding the anon key that ships in the web bundle could read
-- every agent's signing key.
--
-- The service role bypasses RLS regardless, so scoping the policy costs nothing.

DROP POLICY IF EXISTS "Service role full access agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Service role full access rate limits" ON public.ai_agent_rate_limits;

CREATE POLICY "Service role full access agents" ON public.ai_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access rate limits" ON public.ai_agent_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Put the secrets out of reach of client roles entirely
-- ============================================================================
-- Belt and braces. The surviving owner policies match on
-- get_request_wallet_address(), which reads an unsigned request header, so a
-- caller can still claim to be any wallet. Column privileges are evaluated
-- before RLS and cannot be spoofed that way, so the private key stops being
-- reachable by anon and authenticated even if a policy is wrong again later.
--
-- A table-level grant covers every column, so it has to be revoked before
-- per-column grants mean anything.

REVOKE SELECT, UPDATE ON public.ai_agents FROM anon, authenticated;

GRANT SELECT (
  id, name, description, api_key, owner_wallet_address,
  is_active, last_active_at, created_at, updated_at
) ON public.ai_agents TO anon, authenticated;

-- Owners rename and deactivate their agents from /app/agents. They never write
-- the key columns, and metadata is server-owned.
GRANT UPDATE (name, description, is_active) ON public.ai_agents TO anon, authenticated;

-- Only the edge function touches the counters.
REVOKE ALL ON public.ai_agent_rate_limits FROM anon, authenticated;

-- ============================================================================
-- 3. Scrub live bearer tokens out of metadata
-- ============================================================================
-- Registration used to stash the agent's DeHub auth token in metadata, where it
-- sat next to the human_owner field the UI reads. The edge function mints a
-- fresh token per session now, so the stored copies are pure liability.

UPDATE public.ai_agents
SET metadata = metadata - 'dehub_auth_token'
WHERE metadata ? 'dehub_auth_token';

-- ============================================================================
-- 4. Atomic rate limiting
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
