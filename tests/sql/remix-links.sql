-- Run after the remix_links migration on an empty database with the Supabase roles.
\set ON_ERROR_STOP 1
BEGIN;
-- Only the edge function (service role) writes.
SET LOCAL ROLE anon;
DO $$ BEGIN
  INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, remix_token_id) VALUES ('duet', 1, '0xa', '0xb', 2);
  RAISE EXCEPTION 'anon must not insert remix links';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.remix_settings(owner_address, allow_duet) VALUES ('0xa', 'nobody');
  RAISE EXCEPTION 'anon must not write remix settings';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, remix_token_id) VALUES
  ('duet', 1, '0xa', '0xb', 2), ('duet', 1, '0xa', '0xc', 3), ('stitch', 1, '0xa', '0xd', 4);
INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, stream_token_id) VALUES ('react_live', 1, '0xa', '0xe', 50);
INSERT INTO public.remix_settings(owner_address, allow_duet) VALUES ('0xa', 'followers');
INSERT INTO public.remix_settings(owner_address, token_id, allow_duet) VALUES ('0xa', 1, 'nobody');
-- One account default and one row per post.
DO $$ BEGIN
  INSERT INTO public.remix_settings(owner_address, allow_duet) VALUES ('0xa', 'everyone');
  RAISE EXCEPTION 'duplicate account default accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;
-- A post is linked once, and never to itself.
DO $$ BEGIN
  INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, remix_token_id) VALUES ('duet', 9, '0xa', '0xb', 2);
  RAISE EXCEPTION 'duplicate remix accepted';
EXCEPTION WHEN unique_violation THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, remix_token_id) VALUES ('duet', 7, '0xa', '0xb', 7);
  RAISE EXCEPTION 'self remix accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.remix_links(kind, source_token_id, source_address, remixer_address, remix_token_id, split_bps) VALUES ('duet', 7, '0xa', '0xb', 8, 9000);
  RAISE EXCEPTION 'oversized split accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
RESET ROLE;

-- Everyone can read links, settings and counts.
SET LOCAL ROLE anon;
DO $$ DECLARE c record; BEGIN
  SELECT * INTO c FROM public.remix_counts WHERE source_token_id = 1;
  IF c.duets <> 2 OR c.stitches <> 1 OR c.reactions <> 1 THEN RAISE EXCEPTION 'unexpected counts %', row_to_json(c); END IF;
  IF (SELECT count(*) FROM public.remix_settings WHERE owner_address = '0xa') <> 2 THEN RAISE EXCEPTION 'settings unreadable'; END IF;
  IF (SELECT split_bps FROM public.remix_links WHERE remix_token_id = 2) <> 1000 THEN RAISE EXCEPTION 'default split is not 10%%'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo remix links ok
