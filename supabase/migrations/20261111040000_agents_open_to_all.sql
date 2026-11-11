-- Agents are open to everyone signed in. Every agent table, task and RPC still
-- checks that the caller owns the row; this only lifts the rollout gate.
-- Group runs, every-post/every-user runs and Alive mode stay with the team
-- account, enforced in the dehub-mcp function (agentTeamOwner).
CREATE OR REPLACE FUNCTION public.agent_owner_allowed(wallet text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(lower(wallet) ~ '^0x[a-f0-9]{40}$', false);
$$;
NOTIFY pgrst, 'reload schema';
