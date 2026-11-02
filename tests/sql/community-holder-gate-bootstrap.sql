\ir community-chat-history-bootstrap.sql
-- Columns the holder gate touches that the shared fixture leaves out.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS name text;
CREATE OR REPLACE FUNCTION public.community_role_of(_community_id uuid, _wallet text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.community_members
   WHERE community_id = _community_id AND wallet_address = lower(coalesce(_wallet,'')) AND status = 'active' LIMIT 1 $$;
-- pg_net stand-in: http_post queues a request; net.deliver() answers it with net.fake_reply.
CREATE SCHEMA net;
CREATE TABLE net.sent(id bigserial PRIMARY KEY, url text, body jsonb, delivered boolean DEFAULT false);
CREATE TABLE net._http_response(id bigint PRIMARY KEY, status_code integer, content text, error_msg text);
CREATE TABLE net.fake_reply(body text);
INSERT INTO net.fake_reply VALUES ('{}');
CREATE FUNCTION net.http_post(url text, body jsonb, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.sent(url, body) VALUES (url, body) RETURNING id $$;
CREATE FUNCTION net.deliver() RETURNS void LANGUAGE sql AS $$
  INSERT INTO net._http_response(id, status_code, content)
  SELECT s.id, 200, (SELECT body FROM net.fake_reply LIMIT 1) FROM net.sent s WHERE NOT s.delivered;
  UPDATE net.sent SET delivered = true WHERE NOT delivered $$;
GRANT INSERT ON public.community_members, public.community_chat_messages TO authenticated;
-- Production's guard rewrites client-sent role/status; the holder guard must run after it.
CREATE FUNCTION public.community_members_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('dehub.community_privileged', true), '') = '1' THEN RETURN NEW; END IF;
  NEW.role := 'member'; NEW.status := 'active'; RETURN NEW;
END $$;
CREATE TRIGGER community_members_guard_trigger BEFORE INSERT ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_members_guard();
