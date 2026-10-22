CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS 'SELECT public.gen_random_bytes($1)';
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA net; CREATE SCHEMA cron;
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
CREATE TABLE public.ai_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, description text, api_key text, owner_wallet_address text, human_owner_wallet text,is_active boolean,last_active_at timestamptz,created_at timestamptz DEFAULT now());
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE,DELETE ON public.ai_agents TO anon,authenticated;
GRANT ALL ON public.ai_agents TO service_role;
CREATE POLICY owners ON public.ai_agents FOR ALL USING(true) WITH CHECK(true);
CREATE FUNCTION public.get_signed_request_wallet_address() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.signed_wallet',true),''); $$;
\ir ../../supabase/migrations/20261011210000_private_agent_tasks.sql

INSERT INTO ai_agents(id,name,api_key,human_owner_wallet,is_active) VALUES
('00000000-0000-0000-0000-000000000001','owner_agent','private','0x9324840523a5d17dd12a2f11a9472e5a199c1937',true),
('00000000-0000-0000-0000-000000000002','other_agent','other-secret','0x1111111111111111111111111111111111111111',true);

SET ROLE anon;
SELECT set_config('request.headers','{"x-wallet-address":"0x9324840523a5d17dd12a2f11a9472e5a199c1937"}',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_my_agents()) THEN RAISE EXCEPTION 'Unsigned key disclosure'; END IF;
 UPDATE ai_agents SET name='changed';
 IF FOUND THEN RAISE EXCEPTION 'Unsigned mutation'; END IF;
 BEGIN PERFORM public.claim_agent_task(); RAISE EXCEPTION 'Public claim permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.ai_agent_runner; RAISE EXCEPTION 'Runner secret visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.signed_wallet','0x1111111111111111111111111111111111111111',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.get_my_agents()) THEN RAISE EXCEPTION 'Other owner allowed'; END IF; END $$;
SELECT set_config('test.signed_wallet','0x9324840523a5d17dd12a2f11a9472e5a199c1937',false);
DO $$ BEGIN IF (SELECT count(*) FROM public.get_my_agents())<>1 THEN RAISE EXCEPTION 'Owner listing missing'; END IF; END $$;
RESET ROLE;
ALTER TABLE public.ai_agents ADD COLUMN wallet_private_key text, ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
\ir ../../supabase/migrations/20261013010000_badge_agent_capacity.sql
SET ROLE service_role;
DO $$
DECLARE owner_wallet text := '0x9324840523a5d17dd12a2f11a9472e5a199c1937';
BEGIN
  BEGIN
    PERFORM public.reserve_agent_registration(owner_wallet,'agent_two','bio','0x'||repeat('a',40),'0x'||repeat('b',64),'dehub_'||repeat('c',64),1);
    RAISE EXCEPTION 'No-badge account exceeded one slot';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AGENT_OWNER_LIMIT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reserve_agent_registration(owner_wallet,'agent_null','bio','0x'||repeat('a',40),'0x'||repeat('b',64),'dehub_'||repeat('c',64),NULL);
    RAISE EXCEPTION 'Missing allowance accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.reserve_agent_registration('0x1111111111111111111111111111111111111111','other_two','bio','0x'||repeat('a',40),'0x'||repeat('b',64),'dehub_'||repeat('c',64),25);
    RAISE EXCEPTION 'Non-preview owner registered';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  INSERT INTO public.ai_agents(name,human_owner_wallet,is_active)
    SELECT 'dummy_'||n,owner_wallet,true FROM generate_series(2,24) AS n;
  PERFORM public.reserve_agent_registration(owner_wallet,'agent_25','bio','0x'||repeat('a',40),'0x'||repeat('b',64),'dehub_'||repeat('c',64),25);
  IF (SELECT count(*) FROM public.ai_agents WHERE human_owner_wallet=owner_wallet) <> 25 THEN
    RAISE EXCEPTION 'Top badge did not reach 25 slots';
  END IF;
  BEGIN
    PERFORM public.reserve_agent_registration(owner_wallet,'agent_26','bio','0x'||repeat('a',40),'0x'||repeat('b',64),'dehub_'||repeat('c',64),25);
    RAISE EXCEPTION 'Top badge exceeded 25 slots';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'AGENT_OWNER_LIMIT' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SET ROLE service_role;
INSERT INTO ai_agent_tasks(agent_id,owner_wallet,request_id,prompt,plan) VALUES
('00000000-0000-0000-0000-000000000001','0x9324840523a5d17dd12a2f11a9472e5a199c1937',gen_random_uuid(),'Follow everyone','{}'),
('00000000-0000-0000-0000-000000000001','0x9324840523a5d17dd12a2f11a9472e5a199c1937',gen_random_uuid(),'Like today','{}');
DO $$ DECLARE claimed jsonb; BEGIN
 claimed:=public.claim_agent_task();
 IF claimed IS NULL OR claimed->>'status'<>'running' THEN RAISE EXCEPTION 'Task not claimed'; END IF;
 IF public.claim_agent_task() IS NOT NULL THEN RAISE EXCEPTION 'Two tasks mutating one agent'; END IF;
 INSERT INTO ai_agent_task_actions(task_id,cycle,step,target,tool,status) VALUES((claimed->>'id')::uuid,0,0,'123','dehub_vote','pending');
 BEGIN
   INSERT INTO ai_agent_task_actions(task_id,cycle,step,target,tool,status) VALUES((claimed->>'id')::uuid,0,0,'123','dehub_vote','pending');
   RAISE EXCEPTION 'Duplicate action accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 UPDATE ai_agent_tasks SET status='paused',lease_until=NULL WHERE id=(claimed->>'id')::uuid;
 IF public.claim_agent_task()->>'id'=claimed->>'id' THEN RAISE EXCEPTION 'Paused task claimed'; END IF;
END $$;
RESET ROLE;

\ir ../../supabase/migrations/20261022050000_agent_lives.sql
INSERT INTO ai_agent_lives(agent_id,sentient,persona,next_at) VALUES('00000000-0000-0000-0000-000000000001',true,'{"version":1}',now()-interval '1 minute');
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.ai_agent_lives; RAISE EXCEPTION 'Agent lives visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.ai_agent_life_events; RAISE EXCEPTION 'Agent life events visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.claim_agent_life(); RAISE EXCEPTION 'Public life claim permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 -- A task still holding the agent keeps its life session waiting.
 IF public.claim_agent_life() IS NOT NULL THEN RAISE EXCEPTION 'Life claimed while a task holds the agent'; END IF;
 UPDATE ai_agent_tasks SET lease=NULL,lease_until=NULL,status='paused';
 IF public.claim_agent_life() IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid THEN RAISE EXCEPTION 'Due agent not claimed'; END IF;
 IF public.claim_agent_life() IS NOT NULL THEN RAISE EXCEPTION 'Leased agent claimed twice'; END IF;
END $$;
RESET ROLE;
