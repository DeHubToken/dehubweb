-- Apply after the signed call clients are published on web and mobile.
-- No rows are rewritten or removed. Legacy identity remains unchanged elsewhere.
CREATE OR REPLACE FUNCTION public.touch_stage_speech(space_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w text:=public.get_signed_request_wallet_address();
BEGIN
  IF w IS NULL OR w='' THEN RETURN false; END IF;
  UPDATE public.audio_spaces s SET last_speech_at=now()
  WHERE s.id=touch_stage_speech.space_id AND s.status='live'
    AND (s.last_speech_at IS NULL OR s.last_speech_at<now()-interval '60 seconds')
    AND (lower(s.host_wallet_address)=w OR EXISTS (
      SELECT 1 FROM public.space_participants p WHERE p.space_id=s.id
        AND lower(p.wallet_address)=w AND p.left_at IS NULL AND p.role IN ('host','speaker')));
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.touch_stage_speech(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_stage_speech(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_signed_stage_host(p_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.audio_spaces s WHERE s.id = p_space_id
    AND lower(s.host_wallet_address) = nullif(public.get_signed_request_wallet_address(), ''));
$$;
REVOKE ALL ON FUNCTION public.is_signed_stage_host(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_signed_stage_host(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recount_space(p_space_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.audio_spaces s SET
    listener_count = (SELECT count(*) FROM public.space_participants p WHERE p.space_id=s.id AND p.role='listener' AND p.left_at IS NULL),
    speaker_count = (SELECT count(*) FROM public.space_participants p WHERE p.space_id=s.id AND p.role IN ('host','speaker') AND p.left_at IS NULL)
  WHERE s.id=p_space_id;
$$;
REVOKE ALL ON FUNCTION public.recount_space(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recount_space(uuid) TO anon, authenticated, service_role;

-- Replace permissive policies rather than adding checks alongside them (OR).
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND ((tablename IN ('call_sessions','callback_requests','buy_bot_state'))
      OR (tablename IN ('audio_spaces','space_participants','raise_hand_requests','stage_reminders') AND cmd <> 'SELECT'))
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;

CREATE POLICY call_party_read ON public.call_sessions FOR SELECT TO anon, authenticated
USING (nullif(public.get_signed_request_wallet_address(),'') IN (lower(caller_address),lower(recipient_address)));
CREATE POLICY call_owner_insert ON public.call_sessions FOR INSERT TO anon, authenticated
WITH CHECK (lower(caller_address)=nullif(public.get_signed_request_wallet_address(),'') AND status='ringing');
CREATE POLICY call_party_update ON public.call_sessions FOR UPDATE TO anon, authenticated
USING (nullif(public.get_signed_request_wallet_address(),'') IN (lower(caller_address),lower(recipient_address)))
WITH CHECK (nullif(public.get_signed_request_wallet_address(),'') IN (lower(caller_address),lower(recipient_address)));

CREATE POLICY callback_party_read ON public.callback_requests FOR SELECT TO anon, authenticated
USING (nullif(public.get_signed_request_wallet_address(),'') IN (lower(requester_address),lower(recipient_address)));
CREATE POLICY callback_owner_insert ON public.callback_requests FOR INSERT TO anon, authenticated
WITH CHECK (lower(requester_address)=nullif(public.get_signed_request_wallet_address(),'') AND status='pending');
CREATE POLICY callback_party_update ON public.callback_requests FOR UPDATE TO anon, authenticated
USING (nullif(public.get_signed_request_wallet_address(),'') IN (lower(requester_address),lower(recipient_address)))
WITH CHECK (nullif(public.get_signed_request_wallet_address(),'') IN (lower(requester_address),lower(recipient_address)));

CREATE POLICY stage_owner_insert ON public.audio_spaces FOR INSERT TO anon, authenticated
WITH CHECK (lower(host_wallet_address)=nullif(public.get_signed_request_wallet_address(),''));
CREATE POLICY stage_owner_update ON public.audio_spaces FOR UPDATE TO anon, authenticated
USING (lower(host_wallet_address)=nullif(public.get_signed_request_wallet_address(),''))
WITH CHECK (lower(host_wallet_address)=nullif(public.get_signed_request_wallet_address(),''));
CREATE POLICY stage_owner_delete ON public.audio_spaces FOR DELETE TO anon, authenticated
USING (lower(host_wallet_address)=nullif(public.get_signed_request_wallet_address(),''));

CREATE POLICY seat_owner_insert ON public.space_participants FOR INSERT TO anon, authenticated
WITH CHECK (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),''));
CREATE POLICY seat_owner_host_update ON public.space_participants FOR UPDATE TO anon, authenticated
USING (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') OR public.is_signed_stage_host(space_id))
WITH CHECK (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') OR public.is_signed_stage_host(space_id));
CREATE POLICY seat_owner_host_delete ON public.space_participants FOR DELETE TO anon, authenticated
USING (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') OR public.is_signed_stage_host(space_id));

CREATE POLICY hand_owner_insert ON public.raise_hand_requests FOR INSERT TO anon, authenticated
WITH CHECK (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') AND status='pending');
CREATE POLICY hand_owner_host_update ON public.raise_hand_requests FOR UPDATE TO anon, authenticated
USING (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') OR public.is_signed_stage_host(space_id))
WITH CHECK (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),'') OR public.is_signed_stage_host(space_id));
CREATE POLICY reminder_owner_insert ON public.stage_reminders FOR INSERT TO anon, authenticated
WITH CHECK (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),''));
CREATE POLICY reminder_owner_delete ON public.stage_reminders FOR DELETE TO anon, authenticated
USING (lower(wallet_address)=nullif(public.get_signed_request_wallet_address(),''));

CREATE POLICY buy_bot_service_only ON public.buy_bot_state FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.buy_bot_state FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.audio_spaces,public.space_participants,
  public.raise_hand_requests,public.stage_reminders,public.call_sessions,public.callback_requests FROM anon,authenticated;

-- A seat belongs to its original wallet and room; ownership alone must not
-- let a listener grant themselves a publisher token by changing their role.
CREATE OR REPLACE FUNCTION public.guard_stage_seat()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.space_id IS DISTINCT FROM OLD.space_id
    OR NEW.wallet_address IS DISTINCT FROM OLD.wallet_address) THEN
    RAISE EXCEPTION 'Seat identity is fixed' USING ERRCODE='42501';
  END IF;
  IF public.is_signed_stage_host(NEW.space_id) THEN RETURN NEW; END IF;
  IF NEW.role='host' THEN RAISE EXCEPTION 'Only the stage host may hold a host seat' USING ERRCODE='42501'; END IF;
  IF NEW.role='speaker' THEN
    IF TG_OP='UPDATE' THEN
      IF OLD.role='speaker' AND OLD.left_at IS NULL THEN RETURN NEW; END IF;
    ELSE
      -- A reconnect upserts the existing active speaker seat.
      IF EXISTS (SELECT 1 FROM public.space_participants p WHERE p.space_id=NEW.space_id
        AND p.wallet_address=NEW.wallet_address AND p.role='speaker' AND p.left_at IS NULL) THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'Only the host may promote speakers' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_stage_seat BEFORE INSERT OR UPDATE ON public.space_participants
FOR EACH ROW EXECUTE FUNCTION public.guard_stage_seat();

CREATE OR REPLACE FUNCTION public.guard_hand_request()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    RAISE EXCEPTION 'Hand request identity is fixed' USING ERRCODE='42501';
  END IF;
  IF NEW.status='approved' AND NOT public.is_signed_stage_host(NEW.space_id) THEN
    RAISE EXCEPTION 'Only the host may approve a hand' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_hand_request BEFORE UPDATE ON public.raise_hand_requests FOR EACH ROW EXECUTE FUNCTION public.guard_hand_request();

CREATE OR REPLACE FUNCTION public.guard_private_call_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='callback_requests' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.requester_address IS DISTINCT FROM OLD.requester_address
      OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Callback parties are fixed' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.caller_address IS DISTINCT FROM OLD.caller_address
      OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address OR NEW.call_type IS DISTINCT FROM OLD.call_type
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Call parties are fixed' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND
      ((OLD.status='ended') OR (NEW.status='ringing') OR
       (NEW.status='connected' AND lower(NEW.recipient_address)<>public.get_signed_request_wallet_address())) THEN
      RAISE EXCEPTION 'Invalid call transition' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_private_call_update BEFORE UPDATE ON public.call_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_private_call_update();
CREATE TRIGGER guard_private_callback_update BEFORE UPDATE ON public.callback_requests FOR EACH ROW EXECUTE FUNCTION public.guard_private_call_update();
