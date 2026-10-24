BEGIN;
SET LOCAL statement_timeout='15s';
CREATE FUNCTION pg_temp.audit_session(w text, signed boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE payload text; token text;
BEGIN
  IF w NOT IN ('0x9d11111111111111111111111111111111111111','0x9d22222222222222222222222222222222222222','0x9d33333333333333333333333333333333333333') THEN RAISE EXCEPTION 'Fixture wallets only'; END IF;
  payload:=w||'.'||(extract(epoch FROM now())::bigint+300)::text;
  SELECT payload||'.'||encode(extensions.hmac(convert_to(payload,'UTF8'),key,'sha256'),'hex') INTO token FROM wallet_auth.secret WHERE id=1;
  PERFORM set_config('request.headers',json_build_object('x-wallet-address',w,'x-wallet-session',CASE WHEN signed THEN token ELSE '' END)::text,true);
  PERFORM set_config('dehub.signed_wallet','',true);
END $$;
CREATE FUNCTION pg_temp.audit_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.audit_denied(q text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE q; EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'Expected permission denial: %',q; END $$;
-- Fixtures are unique to this transaction. No existing records are changed.
SET LOCAL ROLE anon;
SELECT pg_temp.audit_session('0x9d11111111111111111111111111111111111111');
INSERT INTO public.audio_spaces(id,channel_name,title,host_wallet_address,status)
VALUES('9d111111-2026-4023-8023-111111111111','security-rollback-20261023','Security rollback fixture','0x9d11111111111111111111111111111111111111','scheduled');
INSERT INTO public.space_participants(space_id,wallet_address,role)
VALUES('9d111111-2026-4023-8023-111111111111','0x9d11111111111111111111111111111111111111','host');
INSERT INTO public.call_sessions(id,caller_address,recipient_address,call_type,status)
VALUES('9d222222-2026-4023-8023-222222222222','0x9d11111111111111111111111111111111111111','0x9d22222222222222222222222222222222222222','audio','ringing');
INSERT INTO public.callback_requests(id,requester_address,recipient_address,call_type)
VALUES('9d333333-2026-4023-8023-333333333333','0x9d11111111111111111111111111111111111111','0x9d22222222222222222222222222222222222222','audio');
SELECT pg_temp.audit_denied($q$UPDATE public.call_sessions SET status='connected' WHERE id='9d222222-2026-4023-8023-222222222222'$q$);
SELECT pg_temp.audit_session('0x9d11111111111111111111111111111111111111',false);
SELECT pg_temp.audit_assert((SELECT count(*)=0 FROM public.call_sessions WHERE id='9d222222-2026-4023-8023-222222222222'),'unsigned call hidden');
SELECT pg_temp.audit_assert((SELECT count(*)=0 FROM public.callback_requests WHERE id='9d333333-2026-4023-8023-333333333333'),'unsigned callback hidden');
SELECT pg_temp.audit_denied($q$SELECT * FROM public.buy_bot_state LIMIT 0$q$);
WITH changed AS (UPDATE public.audio_spaces SET title='forged' WHERE id='9d111111-2026-4023-8023-111111111111' RETURNING id)
SELECT pg_temp.audit_assert(count(*)=0,'unsigned stage mutation denied') FROM changed;
SELECT pg_temp.audit_session('0x9d33333333333333333333333333333333333333');
SELECT pg_temp.audit_assert((SELECT count(*)=0 FROM public.call_sessions WHERE id='9d222222-2026-4023-8023-222222222222'),'third-party call hidden');
WITH changed AS (UPDATE public.call_sessions SET status='ended' WHERE id='9d222222-2026-4023-8023-222222222222' RETURNING id)
SELECT pg_temp.audit_assert(count(*)=0,'third-party call mutation denied') FROM changed;
SELECT pg_temp.audit_session('0x9d22222222222222222222222222222222222222');
INSERT INTO public.space_participants(space_id,wallet_address,role)
VALUES('9d111111-2026-4023-8023-111111111111','0x9d22222222222222222222222222222222222222','listener');
SELECT pg_temp.audit_denied($q$UPDATE public.space_participants SET role='speaker' WHERE space_id='9d111111-2026-4023-8023-111111111111' AND wallet_address='0x9d22222222222222222222222222222222222222'$q$);
INSERT INTO public.raise_hand_requests(space_id,wallet_address)
VALUES('9d111111-2026-4023-8023-111111111111','0x9d22222222222222222222222222222222222222');
SELECT pg_temp.audit_denied($q$UPDATE public.raise_hand_requests SET status='approved' WHERE space_id='9d111111-2026-4023-8023-111111111111'$q$);
UPDATE public.call_sessions SET status='connected' WHERE id='9d222222-2026-4023-8023-222222222222';
SELECT pg_temp.audit_assert((SELECT status='connected' FROM public.call_sessions WHERE id='9d222222-2026-4023-8023-222222222222'),'recipient accepts');
SELECT pg_temp.audit_session('0x9d11111111111111111111111111111111111111');
UPDATE public.space_participants SET role='speaker' WHERE space_id='9d111111-2026-4023-8023-111111111111' AND wallet_address='0x9d22222222222222222222222222222222222222';
SELECT public.recount_space('9d111111-2026-4023-8023-111111111111');
SELECT pg_temp.audit_assert((SELECT speaker_count=2 FROM public.audio_spaces WHERE id='9d111111-2026-4023-8023-111111111111'),'host promotion and recount');
UPDATE public.call_sessions SET status='ended' WHERE id='9d222222-2026-4023-8023-222222222222';
SELECT pg_temp.audit_denied($q$UPDATE public.call_sessions SET status='ringing' WHERE id='9d222222-2026-4023-8023-222222222222'$q$);
SELECT pg_temp.audit_denied($q$SELECT * FROM public.consume_edge_rate_limit('security-rollback-20261023','audit',1,60000)$q$);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.audit_assert((SELECT allowed FROM public.consume_edge_rate_limit('security-rollback-20261023','audit',1,60000)),'first rate unit');
SELECT pg_temp.audit_assert((SELECT NOT allowed FROM public.consume_edge_rate_limit('security-rollback-20261023','audit',1,60000)),'second rate denied');
RESET ROLE;
ROLLBACK;
SELECT 'All production fixture assertions passed; transaction rolled back' AS result;
