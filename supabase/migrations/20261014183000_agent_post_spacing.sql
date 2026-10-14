-- Keep every agent owned by the same person at least twenty minutes apart.
CREATE TABLE public.ai_agent_post_slots (
  owner_wallet text PRIMARY KEY CHECK (public.agent_owner_allowed(owner_wallet)),
  next_post_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_agent_post_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agent_post_slots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_agent_post_slots TO service_role;

INSERT INTO public.ai_agent_post_slots (owner_wallet, next_post_at)
SELECT t.owner_wallet, max(a.created_at) + interval '20 minutes'
FROM public.ai_agent_task_actions a
JOIN public.ai_agent_tasks t ON t.id = a.task_id
WHERE a.tool = 'dehub_post_create' AND a.status = 'succeeded'
GROUP BY t.owner_wallet
ON CONFLICT (owner_wallet) DO UPDATE
SET next_post_at = greatest(public.ai_agent_post_slots.next_post_at, EXCLUDED.next_post_at);

CREATE OR REPLACE FUNCTION public.reserve_agent_post_slot(p_owner_wallet text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_allowed timestamptz;
BEGIN
  IF NOT public.agent_owner_allowed(p_owner_wallet) THEN RAISE EXCEPTION 'Agent access is unavailable'; END IF;
  INSERT INTO public.ai_agent_post_slots (owner_wallet, next_post_at)
  VALUES (lower(p_owner_wallet), now()) ON CONFLICT DO NOTHING;
  SELECT next_post_at INTO next_allowed FROM public.ai_agent_post_slots
  WHERE owner_wallet = lower(p_owner_wallet) FOR UPDATE;
  IF next_allowed > now() THEN RETURN next_allowed; END IF;
  UPDATE public.ai_agent_post_slots SET next_post_at = now() + interval '20 minutes'
  WHERE owner_wallet = lower(p_owner_wallet);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.reserve_agent_post_slot(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_post_slot(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_agent_post_publication(p_owner_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.agent_owner_allowed(p_owner_wallet) THEN RAISE EXCEPTION 'Agent access is unavailable'; END IF;
  UPDATE public.ai_agent_post_slots
  SET next_post_at = greatest(next_post_at, now() + interval '20 minutes')
  WHERE owner_wallet = lower(p_owner_wallet);
END $$;
REVOKE ALL ON FUNCTION public.record_agent_post_publication(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_agent_post_publication(text) TO service_role;
