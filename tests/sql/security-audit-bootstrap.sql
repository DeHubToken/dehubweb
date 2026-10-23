\ir video-dub-tip-bootstrap.sql
CREATE ROLE service_role BYPASSRLS;
CREATE PUBLICATION supabase_realtime;
\ir ../../supabase/migrations/20260202080422_e795f1e7-33e0-493f-871a-60db529bddbe.sql
ALTER TABLE public.audio_spaces ADD COLUMN last_speech_at timestamptz;
\ir ../../supabase/migrations/20260406174859_0d4431c2-d19a-47ed-8fb7-a121f9ae1507.sql
CREATE TABLE public.stage_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),space_id uuid,wallet_address text);
ALTER TABLE public.stage_reminders ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.buy_bot_state(id int PRIMARY KEY,last_block_number bigint);
ALTER TABLE public.buy_bot_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY misleading_service_policy ON public.buy_bot_state FOR ALL USING(true) WITH CHECK(true);
CREATE TABLE public.edge_rate_limits(bucket_key text,action_type text,count integer NOT NULL DEFAULT 0,window_start timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(bucket_key,action_type));
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO service_role;
CREATE FUNCTION public.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION public.assert_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Expected permission denial: %',statement;
END $$;
