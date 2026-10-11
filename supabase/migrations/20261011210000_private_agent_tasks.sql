-- Private agent rollout and durable work. No task is created by this migration.
CREATE OR REPLACE FUNCTION public.agent_owner_allowed(wallet text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(lower(wallet)='0x9324840523a5d17dd12a2f11a9472e5a199c1937',false);
$$;

CREATE OR REPLACE FUNCTION public.get_my_agents()
RETURNS TABLE(id uuid,name text,description text,api_key text,owner_wallet_address text,is_active boolean,last_active_at timestamptz,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id,a.name,a.description,a.api_key,a.owner_wallet_address,a.is_active,a.last_active_at,a.created_at
  FROM public.ai_agents a
  WHERE public.agent_owner_allowed(public.get_signed_request_wallet_address())
    AND lower(a.human_owner_wallet)=public.get_signed_request_wallet_address()
  ORDER BY a.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_agents() TO anon,authenticated,service_role;

CREATE POLICY "Private rollout restricts agent edits" ON public.ai_agents AS RESTRICTIVE
FOR UPDATE TO anon,authenticated
USING(public.agent_owner_allowed(public.get_signed_request_wallet_address()))
WITH CHECK(public.agent_owner_allowed(public.get_signed_request_wallet_address()));
CREATE POLICY "Private rollout restricts agent deletion" ON public.ai_agents AS RESTRICTIVE
FOR DELETE TO anon,authenticated
USING(public.agent_owner_allowed(public.get_signed_request_wallet_address()));

CREATE TABLE public.ai_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  owner_wallet text NOT NULL CHECK(public.agent_owner_allowed(owner_wallet)),
  request_id uuid NOT NULL,
  prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 4000),
  plan jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','completed','failed')),
  cursor jsonb NOT NULL DEFAULT '{"step":0}',
  cycle integer NOT NULL DEFAULT 0,
  completed_actions integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  cycle_started_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  lease_until timestamptz,
  needs_review boolean NOT NULL DEFAULT false,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_wallet,request_id)
);
CREATE INDEX ai_agent_tasks_due ON public.ai_agent_tasks(next_run_at) WHERE status IN ('queued','running');
CREATE TABLE public.ai_agent_task_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ai_agent_tasks(id) ON DELETE CASCADE,
  cycle integer NOT NULL,
  step integer NOT NULL,
  target text NOT NULL,
  tool text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','succeeded','skipped','uncertain')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id,cycle,step,target)
);
ALTER TABLE public.ai_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_task_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agent_tasks,public.ai_agent_task_actions FROM anon,authenticated;
GRANT ALL ON public.ai_agent_tasks,public.ai_agent_task_actions TO service_role;

CREATE TABLE public.ai_agent_runner (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
  endpoint text NOT NULL DEFAULT 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/dehub-mcp/tasks/tick'
);
ALTER TABLE public.ai_agent_runner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agent_runner FROM anon,authenticated;
GRANT ALL ON public.ai_agent_runner TO service_role;
INSERT INTO public.ai_agent_runner(id) VALUES(true);

CREATE OR REPLACE FUNCTION public.claim_agent_task()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE task public.ai_agent_tasks;
BEGIN
  -- One runner claims at a time; no two tasks for one agent can mutate concurrently.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('agent-task-claim',0)) THEN RETURN NULL; END IF;
  SELECT t.* INTO task FROM public.ai_agent_tasks t
  JOIN public.ai_agents a ON a.id=t.agent_id
  WHERE t.status IN ('queued','running') AND t.next_run_at<=now()
    AND (t.lease_until IS NULL OR t.lease_until<now())
    AND a.is_active AND public.agent_owner_allowed(a.human_owner_wallet)
    AND a.human_owner_wallet=t.owner_wallet
    AND NOT EXISTS(SELECT 1 FROM public.ai_agent_tasks other WHERE other.agent_id=t.agent_id AND other.lease_until>now())
  ORDER BY t.next_run_at,t.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.ai_agent_tasks SET status='running',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
  WHERE id=task.id RETURNING * INTO task;
  RETURN to_jsonb(task);
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_task() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_task() TO service_role;

CREATE OR REPLACE FUNCTION public.tick_agent_tasks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ai_agent_tasks WHERE status IN ('queued','running') AND next_run_at<=now()
            AND (lease_until IS NULL OR lease_until<now())) THEN
    PERFORM net.http_post(url:=r.endpoint,
      headers:=jsonb_build_object('Content-Type','application/json','x-agent-runner-secret',r.secret),
      body:='{}'::jsonb,timeout_milliseconds:=120000)
    FROM public.ai_agent_runner r WHERE id=true;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.tick_agent_tasks() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('dehub-agent-tasks','* * * * *','SELECT public.tick_agent_tasks();');
