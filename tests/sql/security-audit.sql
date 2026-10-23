BEGIN;
SET LOCAL ROLE anon;
SELECT public.test_dub_session('0x1111111111111111111111111111111111111111');
INSERT INTO public.audio_spaces(id,channel_name,title,host_wallet_address) VALUES('11111111-1111-1111-1111-111111111111','fixture','Fixture','0x1111111111111111111111111111111111111111');
INSERT INTO public.space_participants(space_id,wallet_address,role) VALUES('11111111-1111-1111-1111-111111111111','0x1111111111111111111111111111111111111111','host');
INSERT INTO public.call_sessions(id,caller_address,recipient_address,call_type,status) VALUES('22222222-2222-2222-2222-222222222222','0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','audio','ringing');
INSERT INTO public.callback_requests(id,requester_address,recipient_address,call_type) VALUES('33333333-3333-3333-3333-333333333333','0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','audio');
SELECT public.assert_denied($q$UPDATE public.call_sessions SET status='connected'$q$);

-- An address header without a signature proves nothing.
SELECT public.test_dub_session('0x1111111111111111111111111111111111111111',false);
SELECT public.assert_true((SELECT count(*)=0 FROM public.call_sessions),'anonymous call privacy');
SELECT public.assert_true((SELECT count(*)=0 FROM public.callback_requests),'anonymous callback privacy');
SELECT public.assert_denied($q$INSERT INTO public.call_sessions(caller_address,recipient_address,call_type,status) VALUES('0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222','audio','ringing')$q$);
SELECT public.assert_denied($q$SELECT * FROM public.buy_bot_state$q$);
WITH changed AS (UPDATE public.audio_spaces SET title='forged' RETURNING id) SELECT public.assert_true(count(*)=0,'anonymous stage mutation') FROM changed;

-- A real third wallet still cannot inspect or end somebody else's call.
SELECT public.test_dub_session('0x3333333333333333333333333333333333333333');
SELECT public.assert_true((SELECT count(*)=0 FROM public.call_sessions),'third-party call privacy');
WITH changed AS (UPDATE public.call_sessions SET status='ended' RETURNING id) SELECT public.assert_true(count(*)=0,'third-party call mutation') FROM changed;
WITH changed AS (UPDATE public.audio_spaces SET title='forged' RETURNING id) SELECT public.assert_true(count(*)=0,'third-party stage mutation') FROM changed;

-- Listener joins, raises/lowers their hand, leaves; cannot promote themselves.
SELECT public.test_dub_session('0x2222222222222222222222222222222222222222');
INSERT INTO public.space_participants(space_id,wallet_address) VALUES('11111111-1111-1111-1111-111111111111','0x2222222222222222222222222222222222222222');
SELECT public.assert_denied($q$UPDATE public.space_participants SET role='speaker' WHERE wallet_address='0x2222222222222222222222222222222222222222'$q$);
SELECT public.assert_denied($q$UPDATE public.space_participants SET role='host' WHERE wallet_address='0x2222222222222222222222222222222222222222'$q$);
SELECT public.assert_denied($q$UPDATE public.space_participants SET wallet_address='0x3333333333333333333333333333333333333333' WHERE wallet_address='0x2222222222222222222222222222222222222222'$q$);
INSERT INTO public.raise_hand_requests(space_id,wallet_address) VALUES('11111111-1111-1111-1111-111111111111','0x2222222222222222222222222222222222222222');
SELECT public.assert_denied($q$UPDATE public.raise_hand_requests SET status='approved'$q$);
UPDATE public.raise_hand_requests SET status='rejected';
SELECT public.recount_space('11111111-1111-1111-1111-111111111111');
SELECT public.assert_true((SELECT listener_count=1 AND speaker_count=1 FROM public.audio_spaces),'listener recount');
SELECT public.assert_true((SELECT count(*)=1 FROM public.call_sessions),'recipient sees call');
UPDATE public.call_sessions SET status='connected';
SELECT public.assert_true((SELECT status='connected' FROM public.call_sessions),'recipient accepts call');
SELECT public.assert_denied($q$UPDATE public.call_sessions SET caller_address='0x3333333333333333333333333333333333333333'$q$);
SELECT public.assert_denied($q$UPDATE public.callback_requests SET requester_address='0x3333333333333333333333333333333333333333'$q$);
UPDATE public.callback_requests SET status='completed';

SELECT public.test_dub_session('0x1111111111111111111111111111111111111111');
UPDATE public.space_participants SET role='speaker' WHERE wallet_address='0x2222222222222222222222222222222222222222';
UPDATE public.raise_hand_requests SET status='approved';
SELECT public.recount_space('11111111-1111-1111-1111-111111111111');
SELECT public.assert_true((SELECT listener_count=0 AND speaker_count=2 FROM public.audio_spaces),'host promotion');
UPDATE public.call_sessions SET status='ended';
SELECT public.assert_denied($q$UPDATE public.call_sessions SET status='ringing'$q$);

SELECT public.test_dub_session('0x2222222222222222222222222222222222222222');
INSERT INTO public.space_participants(space_id,wallet_address,role,is_muted,left_at) VALUES('11111111-1111-1111-1111-111111111111','0x2222222222222222222222222222222222222222','speaker',true,NULL)
ON CONFLICT(space_id,wallet_address) DO UPDATE SET role=excluded.role,is_muted=excluded.is_muted,left_at=NULL;
UPDATE public.space_participants SET is_muted=false WHERE wallet_address='0x2222222222222222222222222222222222222222';
UPDATE public.space_participants SET left_at=now() WHERE wallet_address='0x2222222222222222222222222222222222222222';
SELECT public.assert_denied($q$UPDATE public.space_participants SET left_at=NULL WHERE wallet_address='0x2222222222222222222222222222222222222222'$q$);
INSERT INTO public.space_participants(space_id,wallet_address,role,left_at) VALUES('11111111-1111-1111-1111-111111111111','0x2222222222222222222222222222222222222222','listener',NULL)
ON CONFLICT(space_id,wallet_address) DO UPDATE SET role=excluded.role,left_at=NULL;
SELECT public.recount_space('11111111-1111-1111-1111-111111111111');
SELECT public.assert_true((SELECT listener_count=1 AND speaker_count=1 FROM public.audio_spaces),'rejoin after leaving');
SELECT public.assert_denied($q$SELECT * FROM public.consume_edge_rate_limit('caller','audit',1,60000)$q$);
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.buy_bot_state VALUES(1,123);
SELECT public.assert_true((SELECT allowed FROM public.consume_edge_rate_limit('sequential','audit',1,60000)),'first rate unit');
SELECT public.assert_true((SELECT NOT allowed FROM public.consume_edge_rate_limit('sequential','audit',1,60000)),'second rate denied');
ROLLBACK;
