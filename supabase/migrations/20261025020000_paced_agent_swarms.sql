-- One immutable post snapshot, with the first member due immediately.
CREATE OR REPLACE FUNCTION public.create_paced_agent_swarm(
  p_owner_wallet text, p_agent_ids uuid[], p_request_id uuid, p_prompt text,
  p_plan jsonb, p_targets text[]
) RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE gap_seconds numeric := (p_plan->'pacing'->>'gap_seconds')::numeric;
BEGIN
  IF gap_seconds IS NULL OR gap_seconds < 0 OR gap_seconds > 86400
    OR cardinality(p_targets) IS NULL OR cardinality(p_targets) NOT BETWEEN 1 AND 10000
    OR EXISTS(SELECT 1 FROM unnest(p_targets) target WHERE target IS NULL OR target !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'Invalid paced swarm.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-swarm-' || lower(p_owner_wallet),0));
  IF EXISTS(SELECT 1 FROM ai_agent_tasks t WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id) THEN
    RETURN QUERY SELECT t.id FROM ai_agent_tasks t WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id ORDER BY t.swarm_index;
    RETURN;
  END IF;
  PERFORM public.create_agent_swarm_tasks_v2(p_owner_wallet,p_agent_ids,p_request_id,p_prompt,p_plan,NULL,'each');
  UPDATE ai_agent_tasks t SET
    cursor=jsonb_build_object('step',0,'targets',to_jsonb(p_targets),'index',0,'done',true),
    next_run_at=now() + t.swarm_index * gap_seconds * interval '1 second'
  WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id;
  RETURN QUERY SELECT t.id FROM ai_agent_tasks t WHERE t.owner_wallet=p_owner_wallet AND t.swarm_id=p_request_id ORDER BY t.swarm_index;
END $$;
REVOKE ALL ON FUNCTION public.create_paced_agent_swarm(text,uuid[],uuid,text,jsonb,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_paced_agent_swarm(text,uuid[],uuid,text,jsonb,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_agent_task()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE task public.ai_agent_tasks;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('agent-task-claim',0)) THEN RETURN NULL; END IF;
  SELECT t.* INTO task FROM public.ai_agent_tasks t
  JOIN public.ai_agents a ON a.id=t.agent_id
  WHERE t.status IN ('queued','running') AND t.next_run_at<=now()
    AND (t.lease_until IS NULL OR t.lease_until<now())
    AND a.is_active AND public.agent_owner_allowed(a.human_owner_wallet) AND a.human_owner_wallet=t.owner_wallet
    AND NOT EXISTS(SELECT 1 FROM public.ai_agent_tasks other WHERE other.agent_id=t.agent_id AND other.lease_until>now())
    AND (NOT (t.plan ? 'pacing') OR NOT EXISTS(
      SELECT 1 FROM public.ai_agent_tasks other WHERE other.swarm_id=t.swarm_id AND other.owner_wallet=t.owner_wallet AND other.id<>t.id
        AND (other.lease_until>now() OR (other.status IN ('queued','running') AND
          (coalesce((other.cursor->>'index')::integer,0),other.swarm_index) < (coalesce((t.cursor->>'index')::integer,0),t.swarm_index)))
    ))
  ORDER BY t.next_run_at,t.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.ai_agent_tasks SET status='running',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
  WHERE id=task.id RETURNING * INTO task;
  -- A delayed runner must not catch up by releasing many overdue turns at once.
  IF task.plan ? 'pacing' THEN
    UPDATE ai_agent_tasks other SET next_run_at=greatest(other.next_run_at,
      now() + (task.plan->'pacing'->>'gap_seconds')::numeric * interval '1 second')
    WHERE other.owner_wallet=task.owner_wallet AND other.swarm_id=task.swarm_id AND other.id<>task.id AND other.status='queued';
  END IF;
  RETURN to_jsonb(task);
END $$;
