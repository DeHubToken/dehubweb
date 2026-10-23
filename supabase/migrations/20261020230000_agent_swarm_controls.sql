-- Deploy before dehub-mcp and the agent control UI. Existing swarms keep shared work.
ALTER TABLE public.ai_agent_tasks
  DROP CONSTRAINT ai_agent_tasks_status_check,
  ADD CONSTRAINT ai_agent_tasks_status_check CHECK (status IN ('queued','running','paused','completed','failed','cancelled')),
  ADD COLUMN swarm_mode text NOT NULL DEFAULT 'shared' CHECK (swarm_mode IN ('shared','each')),
  DROP CONSTRAINT ai_agent_tasks_swarm_shape,
  ADD CONSTRAINT ai_agent_tasks_swarm_shape CHECK (
    (swarm_id IS NULL AND swarm_index IS NULL AND swarm_size IS NULL)
    OR (swarm_id IS NOT NULL AND swarm_size BETWEEN 2 AND 25 AND swarm_index >= 0 AND swarm_index < swarm_size)
  );

CREATE OR REPLACE FUNCTION public.create_agent_swarm_tasks_v2(
  p_owner_wallet text, p_agent_ids uuid[], p_request_id uuid, p_prompt text,
  p_plan jsonb, p_interval_minutes numeric, p_mode text
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  member_count integer := cardinality(p_agent_ids);
  active_count integer;
BEGIN
  IF NOT public.agent_owner_allowed(p_owner_wallet) THEN
    RAISE EXCEPTION 'Agent access is unavailable.';
  END IF;
  IF member_count IS NULL OR member_count < 2 OR member_count > 25
    OR p_prompt IS NULL OR length(p_prompt) NOT BETWEEN 1 AND 4000
    OR p_request_id IS NULL OR p_plan IS NULL OR p_mode IS NULL OR p_mode NOT IN ('shared','each')
    OR (p_interval_minutes IS NOT NULL AND p_interval_minutes < 30) THEN
    RAISE EXCEPTION 'Invalid swarm request.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-swarm-' || lower(p_owner_wallet), 0));
  IF EXISTS(SELECT 1 FROM public.ai_agent_tasks t WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id) THEN
    RETURN QUERY SELECT t.id FROM public.ai_agent_tasks t
      WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id ORDER BY t.swarm_index;
    RETURN;
  END IF;
  IF (SELECT count(DISTINCT member) FROM unnest(p_agent_ids) AS member) <> member_count
    OR (SELECT count(*) FROM public.ai_agents a WHERE a.id=ANY(p_agent_ids)
        AND a.human_owner_wallet=p_owner_wallet AND a.is_active) <> member_count THEN
    RAISE EXCEPTION 'Select active agents you own.';
  END IF;
  SELECT count(*) INTO active_count FROM public.ai_agent_tasks t
    WHERE t.owner_wallet=p_owner_wallet AND t.status IN ('queued','running');
  IF active_count + member_count > 100 THEN
    RAISE EXCEPTION 'Pause or finish tasks before adding the swarm (100 active tasks).';
  END IF;
  RETURN QUERY
    INSERT INTO public.ai_agent_tasks(agent_id,owner_wallet,request_id,prompt,plan,swarm_id,swarm_index,swarm_size,swarm_mode,next_run_at,cycle_started_at)
    SELECT member,p_owner_wallet,gen_random_uuid(),p_prompt,p_plan,p_request_id,ordinality::integer-1,member_count,p_mode,
      now() + ((ordinality-1) * coalesce(p_interval_minutes,0) * interval '1 minute'),
      now() + ((ordinality-1) * coalesce(p_interval_minutes,0) * interval '1 minute')
    FROM unnest(p_agent_ids) WITH ORDINALITY AS selected(member,ordinality)
    RETURNING ai_agent_tasks.id;
END $$;
REVOKE ALL ON FUNCTION public.create_agent_swarm_tasks_v2(text,uuid[],uuid,text,jsonb,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_swarm_tasks_v2(text,uuid[],uuid,text,jsonb,numeric,text) TO service_role;
