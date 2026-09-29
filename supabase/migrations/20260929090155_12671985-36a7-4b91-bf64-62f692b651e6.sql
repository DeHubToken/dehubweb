CREATE OR REPLACE FUNCTION public.broadcast_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'eventType', TG_OP,
        'new', CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
        'old', CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('id', OLD.id, 'status', OLD.status) END
      ),
      'change',
      'stages',
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.broadcast_stage_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_stage_change ON public.audio_spaces;
CREATE TRIGGER broadcast_stage_change
  AFTER INSERT OR UPDATE OR DELETE ON public.audio_spaces
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_stage_change();

CREATE OR REPLACE FUNCTION public.ping_notification_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recipient text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      FOR recipient IN
        SELECT DISTINCT lower(recipient_address) FROM changed_old WHERE recipient_address IS NOT NULL
      LOOP
        PERFORM realtime.send('{}'::jsonb, 'ping', 'notif:' || recipient, true);
      END LOOP;
    ELSE
      FOR recipient IN
        SELECT DISTINCT lower(recipient_address) FROM changed_new WHERE recipient_address IS NOT NULL
      LOOP
        PERFORM realtime.send('{}'::jsonb, 'ping', 'notif:' || recipient, true);
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.ping_notification_recipients() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ping_notification_insert ON public.custom_notifications;
CREATE TRIGGER ping_notification_insert
  AFTER INSERT ON public.custom_notifications
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.ping_notification_recipients();

DROP TRIGGER IF EXISTS ping_notification_update ON public.custom_notifications;
CREATE TRIGGER ping_notification_update
  AFTER UPDATE ON public.custom_notifications
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.ping_notification_recipients();

DROP TRIGGER IF EXISTS ping_notification_delete ON public.custom_notifications;
CREATE TRIGGER ping_notification_delete
  AFTER DELETE ON public.custom_notifications
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.ping_notification_recipients();

CREATE OR REPLACE FUNCTION dex_private.announce_market()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  BEGIN
    INSERT INTO public.dex_market_tick (id, observed_at, revision)
    VALUES (true, clock_timestamp(), 1)
    ON CONFLICT (id) DO UPDATE
      SET observed_at = excluded.observed_at,
          revision = public.dex_market_tick.revision + 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'tick', 'dex:market', true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION dex_private.announce_market() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Anyone can listen to stage and market broadcasts" ON realtime.messages;
CREATE POLICY "Anyone can listen to stage and market broadcasts"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() IN ('stages', 'dex:market')
  );

DROP POLICY IF EXISTS "Anyone can listen for notification pings" ON realtime.messages;
CREATE POLICY "Anyone can listen for notification pings"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() LIKE 'notif:%'
  );