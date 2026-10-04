-- Execute as one transaction; every fixture and billing entry is rolled back.
BEGIN;
DO $$
DECLARE
  campaign uuid := gen_random_uuid();
  creative uuid := gen_random_uuid();
  session uuid := gen_random_uuid();
  advertiser text := '0x' || substr(md5(gen_random_uuid()::text),1,32) || '12345678';
  viewer text := '0x' || substr(md5(gen_random_uuid()::text),1,32) || '12345678';
  creator text := '0x' || substr(md5(gen_random_uuid()::text),1,32) || '12345678';
  result jsonb;
  balance numeric;
BEGIN
  INSERT INTO ad_accounts(wallet_address,balance_usd) VALUES(advertiser,10);
  INSERT INTO ad_campaigns(id,wallet_address,name,status,daily_budget_usd,total_budget_usd,targeting)
    VALUES(campaign,advertiser,'Support transaction verification','active',1,1,'{"creatorSupport":true}');
  INSERT INTO ad_creatives(id,campaign_id,wallet_address,kind,media_url,headline,duration_seconds,status)
    VALUES(creative,campaign,advertiser,'video','https://dehub.io/test-video.mp4','Support verification',31,'approved');
  INSERT INTO ad_creator_support_sessions(id,viewer_wallet,creator_wallet,post_id,campaign_id,creative_id,viewer_tier,price_usd,creator_share_usd,expires_at)
    VALUES(session,viewer,creator,'6175',campaign,creative,'none',0.1,0.05,now()+interval '15 minutes');

  result := ads_advance_creator_support(session, advertiser, 30);
  IF result->>'error' IS NULL THEN RAISE EXCEPTION 'Another wallet could advance the session'; END IF;
  result := ads_advance_creator_support(session, viewer, 30);
  IF coalesce((result->>'credited')::boolean,false) THEN RAISE EXCEPTION 'A seek instantly credited support'; END IF;
  IF EXISTS(SELECT 1 FROM ad_events WHERE serve_id=session) THEN RAISE EXCEPTION 'Incomplete playback was billed'; END IF;

  UPDATE ad_creator_support_sessions SET watched_seconds=25,reported_seconds=25,progress_at=clock_timestamp()-interval '5 seconds' WHERE id=session;
  result := ads_advance_creator_support(session,viewer,30);
  IF result->>'credited' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Completed support did not credit: %',result; END IF;
  SELECT balance_usd INTO balance FROM ad_accounts WHERE wallet_address=advertiser;
  IF balance <> 9.9 THEN RAISE EXCEPTION 'Wrong advertiser debit: %',balance; END IF;
  IF (SELECT total_earned_usd FROM ad_earnings WHERE wallet_address=creator) <> 0.05 THEN RAISE EXCEPTION 'Wrong creator share'; END IF;
  IF EXISTS(SELECT 1 FROM ad_earnings WHERE wallet_address=viewer) THEN RAISE EXCEPTION 'The viewer received the creator share'; END IF;
  IF (SELECT viewer_wallet FROM ad_events WHERE serve_id=session) <> viewer THEN RAISE EXCEPTION 'Wrong viewer attribution'; END IF;
  result := ads_advance_creator_support(session,viewer,30);
  IF result->>'credited' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Receipt retry failed'; END IF;
  IF (SELECT balance_usd FROM ad_accounts WHERE wallet_address=advertiser) <> balance THEN RAISE EXCEPTION 'Retry billed twice'; END IF;
  IF (SELECT count(*) FROM ad_events WHERE serve_id=session) <> 1 THEN RAISE EXCEPTION 'Duplicate billing event'; END IF;

  session := gen_random_uuid();
  INSERT INTO ad_creator_support_sessions(id,viewer_wallet,creator_wallet,post_id,campaign_id,creative_id,viewer_tier,price_usd,creator_share_usd,expires_at,watched_seconds,reported_seconds,progress_at)
    VALUES(session,viewer,creator,'6175',campaign,creative,'none',0.1,0.05,now()+interval '15 minutes',25,25,clock_timestamp()-interval '5 seconds');
  UPDATE ad_accounts SET balance_usd=0 WHERE wallet_address=advertiser;
  result := ads_advance_creator_support(session,viewer,30);
  IF result->>'error' IS NULL OR EXISTS(SELECT 1 FROM ad_events WHERE serve_id=session) THEN RAISE EXCEPTION 'An empty budget was billed'; END IF;
  UPDATE ad_creator_support_sessions SET expires_at=now()-interval '1 second' WHERE id=session;
  result := ads_advance_creator_support(session,viewer,30);
  IF result->>'error' IS NULL THEN RAISE EXCEPTION 'Expired support could credit'; END IF;
END;
$$;
ROLLBACK;
