CREATE OR REPLACE FUNCTION public.ping_call_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  payload := jsonb_build_object('id', NEW.id, 'status', NEW.status, 'created_at', NEW.created_at);
  BEGIN
    IF NEW.recipient_address IS NOT NULL THEN
      PERFORM realtime.send(payload, 'call', 'call:' || lower(NEW.recipient_address), true);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.caller_address IS NOT NULL
       AND lower(NEW.caller_address) IS DISTINCT FROM lower(NEW.recipient_address) THEN
      PERFORM realtime.send(payload, 'call', 'call:' || lower(NEW.caller_address), true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.ping_call_participants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ping_call_participants ON public.call_sessions;
CREATE TRIGGER ping_call_participants
  AFTER INSERT OR UPDATE OF status ON public.call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.ping_call_participants();

DROP POLICY IF EXISTS "Anyone can listen for call pings" ON realtime.messages;
CREATE POLICY "Anyone can listen for call pings"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() LIKE 'call:%'
  );