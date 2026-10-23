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
