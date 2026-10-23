-- Agents that live on their own. An owner switches an agent to "alive" and it
-- keeps its own day: wakes and sleeps in its own timezone, checks the app a few
-- times a day, posts in its own voice, likes and replies like a person would.
-- Private: only the dehub-mcp function (service role) reads or writes these.

CREATE TABLE IF NOT EXISTS public.ai_agent_lives (
  agent_id uuid PRIMARY KEY REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  sentient boolean NOT NULL DEFAULT false,
  persona jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_agent_life_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('post','like','comment','reply','profile','photo','error')),
  target text,
  content text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One like per post, one reply per comment, one use of each stock photo.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_life_events_once
  ON public.ai_agent_life_events(agent_id, kind, target) WHERE target IS NOT NULL AND kind IN ('like','comment','reply','photo');
CREATE INDEX IF NOT EXISTS ai_agent_life_events_recent ON public.ai_agent_life_events(agent_id, created_at DESC);

ALTER TABLE public.ai_agent_lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_life_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agent_lives, public.ai_agent_life_events FROM anon, authenticated;
GRANT ALL ON public.ai_agent_lives, public.ai_agent_life_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_agent_life()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claimed uuid;
BEGIN
  SELECT l.agent_id INTO claimed FROM public.ai_agent_lives l
  JOIN public.ai_agents a ON a.id = l.agent_id
  WHERE l.sentient AND l.persona IS NOT NULL AND l.next_at <= now()
    AND (l.lease_until IS NULL OR l.lease_until < now())
    AND a.is_active AND public.agent_owner_allowed(a.human_owner_wallet)
    AND NOT EXISTS(SELECT 1 FROM public.ai_agent_tasks t WHERE t.agent_id = l.agent_id AND t.lease_until > now())
  ORDER BY l.next_at FOR UPDATE OF l SKIP LOCKED LIMIT 1;
  IF claimed IS NULL THEN RETURN NULL; END IF;
  UPDATE public.ai_agent_lives SET lease_until = now() + interval '4 minutes' WHERE agent_id = claimed;
  RETURN claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_life() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_life() TO service_role;

CREATE OR REPLACE FUNCTION public.tick_agent_lives()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_agent_lives l JOIN public.ai_agents a ON a.id = l.agent_id
            WHERE l.sentient AND l.persona IS NOT NULL AND l.next_at <= now()
              AND (l.lease_until IS NULL OR l.lease_until < now())
              AND a.is_active AND public.agent_owner_allowed(a.human_owner_wallet)) THEN
    PERFORM net.http_post(url := replace(r.endpoint, '/tasks/tick', '/life/tick'),
      headers := jsonb_build_object('Content-Type','application/json','x-agent-runner-secret',r.secret),
      body := '{}'::jsonb, timeout_milliseconds := 120000)
    FROM public.ai_agent_runner r WHERE id = true;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.tick_agent_lives() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('dehub-agent-lives', '* * * * *', 'SELECT public.tick_agent_lives();');
