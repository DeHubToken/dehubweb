-- Private workspace records are only accessible through authenticated owner routes.
CREATE TABLE public.ai_agent_controls (
  agent_id uuid PRIMARY KEY REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_alert_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_agent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  tool text NOT NULL,
  arguments jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','approval','executing','succeeded','failed','uncertain','rejected','blocked')),
  result jsonb,
  undo jsonb,
  rollback_status text CHECK (rollback_status IN ('executing','succeeded','uncertain')),
  alert_delivery text CHECK (alert_delivery IN ('delivered','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_agent_receipts_recent ON public.ai_agent_receipts(agent_id,created_at DESC);
CREATE TABLE public.ai_agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  published boolean NOT NULL DEFAULT false,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_agent_tasks ADD COLUMN workspace_template_id text;
CREATE TABLE public.ai_agent_news_cache (
  feed text PRIMARY KEY,
  stories jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_agent_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_news_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agent_controls,public.ai_agent_receipts,public.ai_agent_templates,public.ai_agent_news_cache FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_agent_controls,public.ai_agent_receipts,public.ai_agent_templates,public.ai_agent_news_cache TO service_role;


-- A schema-backed capability, readable only by the service role. Frontends
-- stay compatible with an older function until this migration and the swarm
-- dependency have both been applied. Never deploy controlledAction ahead of
-- these migrations: this probe does not bypass missing write controls.
CREATE OR REPLACE FUNCTION public.agent_workspace_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT to_regclass('public.ai_agent_controls') IS NOT NULL
    AND to_regclass('public.ai_agent_receipts') IS NOT NULL
    AND to_regclass('public.ai_agent_templates') IS NOT NULL
    AND to_regclass('public.ai_agent_news_cache') IS NOT NULL
    AND to_regprocedure('public.create_agent_swarm_tasks_v2(text,uuid[],uuid,text,jsonb,numeric,text)') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.ai_agent_tasks') AND attname='workspace_template_id' AND NOT attisdropped)
    AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.ai_agent_tasks') AND attname='swarm_mode' AND NOT attisdropped);
$$;
REVOKE ALL ON FUNCTION public.agent_workspace_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_workspace_ready() TO service_role;
