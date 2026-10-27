BEGIN;
INSERT INTO communities(id,is_private) VALUES
 ('10000000-0000-0000-0000-000000000001',false),
 ('10000000-0000-0000-0000-000000000002',true);
INSERT INTO community_members(community_id,wallet_address) VALUES
 ('10000000-0000-0000-0000-000000000002','0x1111111111111111111111111111111111111111');
-- 260 rows share a timestamp, exposing any timestamp-only cursor gap.
INSERT INTO community_chat_messages(id,community_id,wallet_address,content,created_at)
 SELECT ('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000001','0x1111111111111111111111111111111111111111',
 'message '||i,'2026-10-01T12:00:00.123456Z' FROM generate_series(1,260) i;
INSERT INTO community_chat_messages(id,community_id,wallet_address,content,created_at)
 VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
 '0x1111111111111111111111111111111111111111','private fixture','2026-10-01T12:00:00.123456Z');
UPDATE community_chat_messages SET pinned_at=now() WHERE id='20000000-0000-0000-0000-000000000001';
UPDATE community_chat_messages SET reply_to_id='20000000-0000-0000-0000-000000000001'
 WHERE id='20000000-0000-0000-0000-000000000260';
-- Legacy bad data must not cause cross-community reference leakage.
UPDATE community_chat_messages SET reply_to_id='30000000-0000-0000-0000-000000000001'
 WHERE id='20000000-0000-0000-0000-000000000259';

SET LOCAL ROLE anon;
DO $$
DECLARE p jsonb; c jsonb; ids uuid[] := '{}'; batch uuid[]; previous_count integer:=0;
BEGIN
 LOOP
  p:=community_chat_page_v1('10000000-0000-0000-0000-000000000001',
    (c->>'created_at')::timestamptz,(c->>'id')::uuid);
  SELECT array_agg((value->>'id')::uuid) INTO batch FROM jsonb_array_elements(p->'messages');
  ids:=ids||coalesce(batch,'{}');
  ASSERT cardinality(ids)>previous_count,'history stopped making progress';
  previous_count:=cardinality(ids);
  c:=nullif(p->'next_cursor','null'::jsonb);
  EXIT WHEN c IS NULL;
 END LOOP;
 ASSERT cardinality(ids)=260,'history beyond 200 was lost';
 ASSERT (SELECT count(DISTINCT id) FROM unnest(ids) id)=260,'page boundary duplicates';
 ASSERT ids[1]='20000000-0000-0000-0000-000000000260'::uuid,'UUID tie ordering';
 ASSERT ids[260]='20000000-0000-0000-0000-000000000001'::uuid,'last page ordering';
 p:=community_chat_page_v1('10000000-0000-0000-0000-000000000001');
 ASSERT p->'pinned_message'->>'id'='20000000-0000-0000-0000-000000000001','old pin absent';
 ASSERT jsonb_array_length(p->'references')=1,'reference scope leaked';
 ASSERT p->'references'->0->>'id'='20000000-0000-0000-0000-000000000001','old reply absent';
 ASSERT p->'next_cursor'->>'created_at' LIKE '%.123456%','cursor lost microseconds';
 p:=community_chat_page_v1('10000000-0000-0000-0000-000000000001',_anchor_id=>'20000000-0000-0000-0000-000000000010');
 ASSERT p->'messages'->0->>'id'='20000000-0000-0000-0000-000000000010','anchor absent';
 ASSERT jsonb_array_length(p->'messages')=10,'anchor direction wrong';
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000001',_anchor_id=>'30000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'cross-community anchor accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000001',_limit=>101);
  RAISE EXCEPTION 'unbounded page accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000001',_before_id=>'20000000-0000-0000-0000-000000000010');
  RAISE EXCEPTION 'partial cursor accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'anonymous private read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('dehub.signed_wallet','',true);
 PERFORM set_config('request.headers','{"x-wallet-address":"0x1111111111111111111111111111111111111111"}',true);
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'unsigned wallet accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM history_test_session('0x1111111111111111111111111111111111111111',true);
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'expired session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM history_test_session('0x2222222222222222222222222222222222222222');
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'nonmember accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM history_test_session('0x1111111111111111111111111111111111111111');
 p:=community_chat_page_v1('10000000-0000-0000-0000-000000000002');
 ASSERT jsonb_array_length(p->'messages')=1,'signed member denied';
END $$;
RESET ROLE;

DELETE FROM community_chat_messages WHERE id='20000000-0000-0000-0000-000000000211';
UPDATE community_members SET status='banned';
SET LOCAL ROLE anon;
DO $$
DECLARE p jsonb;
BEGIN
 p:=community_chat_page_v1('10000000-0000-0000-0000-000000000001',
 '2026-10-01T12:00:00.123456Z','20000000-0000-0000-0000-000000000211');
 ASSERT p->'messages'->0->>'id'='20000000-0000-0000-0000-000000000210','deleted cursor broke history';
 PERFORM history_test_session('0x1111111111111111111111111111111111111111');
 BEGIN
  PERFORM community_chat_page_v1('10000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'revoked member accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
