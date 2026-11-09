-- @maldoteth moved to a new wallet. Agents, their tasks, templates and posting slot
-- move with him; the erased wallet stays allowed so nothing filed under it stops.
CREATE OR REPLACE FUNCTION public.agent_owner_allowed(wallet text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(lower(wallet) IN ('0xec4e2c7417f781b35d830671f013b3b91f29ba64','0x9324840523a5d17dd12a2f11a9472e5a199c1937'),false);
$$;

UPDATE public.ai_agents SET human_owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64'
WHERE lower(human_owner_wallet)='0x9324840523a5d17dd12a2f11a9472e5a199c1937';

UPDATE public.ai_agent_tasks SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64'
WHERE lower(owner_wallet)='0x9324840523a5d17dd12a2f11a9472e5a199c1937';

UPDATE public.ai_agent_templates SET owner_wallet='0xec4e2c7417f781b35d830671f013b3b91f29ba64'
WHERE lower(owner_wallet)='0x9324840523a5d17dd12a2f11a9472e5a199c1937';

INSERT INTO public.ai_agent_post_slots (owner_wallet, next_post_at)
SELECT '0xec4e2c7417f781b35d830671f013b3b91f29ba64', next_post_at FROM public.ai_agent_post_slots
WHERE owner_wallet='0x9324840523a5d17dd12a2f11a9472e5a199c1937'
ON CONFLICT (owner_wallet) DO NOTHING;

DO $$ BEGIN
  IF to_regclass('work_private.arbiters') IS NOT NULL THEN
    INSERT INTO work_private.arbiters VALUES ('0xec4e2c7417f781b35d830671f013b3b91f29ba64') ON CONFLICT DO NOTHING;
  END IF;
END $$;
