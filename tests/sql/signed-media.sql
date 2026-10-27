BEGIN;
SET LOCAL ROLE anon;
SELECT public.test_dub_session('0x1111111111111111111111111111111111111111',false);
SELECT public.assert_true(public.get_request_wallet_address()='','bare header is not identity');
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('store-media','0x1111111111111111111111111111111111111111/a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('ad-media','0x1111111111111111111111111111111111111111/a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('ai-media-uploads','a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('community-media','a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('feature-media','a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('agent-avatars','a.png')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('soundboard-sounds','0x1111111111111111111111111111111111111111/a.mp3')$q$);
SELECT public.assert_denied($q$INSERT INTO public.stories(wallet_address) VALUES('0x1111111111111111111111111111111111111111')$q$);
SELECT public.assert_denied($q$INSERT INTO public.story_views(viewer_wallet_address) VALUES('0x1111111111111111111111111111111111111111')$q$);

SELECT public.test_dub_session('0x1111111111111111111111111111111111111111');
SELECT public.assert_true(public.get_request_wallet_address()='0x1111111111111111111111111111111111111111','signature wins over forged address header');
INSERT INTO storage.objects(bucket_id,name) VALUES
('store-media','0x1111111111111111111111111111111111111111/a.png'),
('ad-media','0x1111111111111111111111111111111111111111/a.png'),
('soundboard-sounds','0x1111111111111111111111111111111111111111/a.mp3'),
('ai-media-uploads','a.png'),('community-media','a.png'),('feature-media','a.png');
INSERT INTO public.stories(wallet_address) VALUES('0x1111111111111111111111111111111111111111');
INSERT INTO public.story_views(viewer_wallet_address) VALUES('0x1111111111111111111111111111111111111111');
SELECT public.assert_denied($q$INSERT INTO public.stories(wallet_address) VALUES('0x2222222222222222222222222222222222222222')$q$);
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('agent-avatars','a.png')$q$);
SELECT public.assert_denied($q$UPDATE storage.objects SET name='0x2222222222222222222222222222222222222222/moved.png' WHERE bucket_id='store-media'$q$);

SELECT public.test_dub_session('0x2222222222222222222222222222222222222222');
WITH changed AS (UPDATE storage.objects SET name='tampered.png' WHERE bucket_id IN ('store-media','ad-media') RETURNING id)
SELECT public.assert_true(count(*)=0,'other wallet cannot overwrite commerce media') FROM changed;
WITH changed AS (DELETE FROM storage.objects WHERE bucket_id IN ('store-media','ad-media') RETURNING id)
SELECT public.assert_true(count(*)=0,'other wallet cannot delete commerce media') FROM changed;
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('store-media','0x1111111111111111111111111111111111111111/new.png')$q$);

SELECT public.test_dub_session('0x1111111111111111111111111111111111111111');
INSERT INTO public.audio_spaces(id,channel_name,title,host_wallet_address)
VALUES('11111111-1111-1111-1111-111111111111','signed-media-fixture','Fixture','0x1111111111111111111111111111111111111111');
INSERT INTO storage.objects(bucket_id,name) VALUES('stage-recordings','11111111-1111-1111-1111-111111111111/recording.aac');
UPDATE storage.objects SET name='11111111-1111-1111-1111-111111111111/recording.mp4' WHERE bucket_id='stage-recordings';
SELECT public.test_dub_session('0x2222222222222222222222222222222222222222');
SELECT public.assert_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES('stage-recordings','11111111-1111-1111-1111-111111111111/forged.aac')$q$);
WITH changed AS (UPDATE storage.objects SET name='tampered.aac' WHERE bucket_id='stage-recordings' RETURNING id)
SELECT public.assert_true(count(*)=0,'only host can replace recording') FROM changed;

SELECT public.test_dub_session('0x1111111111111111111111111111111111111111');
WITH changed AS (DELETE FROM storage.objects WHERE bucket_id IN ('store-media','ad-media') RETURNING id)
SELECT public.assert_true(count(*)=2,'owner can delete own commerce media') FROM changed;
RESET ROLE;
-- The retired rollout switch cannot re-enable unsigned identity.
UPDATE wallet_auth.config SET enforce=false;
SET LOCAL ROLE authenticated;
SELECT public.test_dub_session('0x1111111111111111111111111111111111111111',false);
SELECT public.assert_true(public.get_request_wallet_address()='','authenticated JWT without wallet proof cannot impersonate a wallet');
RESET ROLE;
ROLLBACK;
