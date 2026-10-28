-- Remix links: which post (or live stream) remixes which DeHub video.
--
-- One row per remix. React is the first kind written here; Duet and Stitch
-- use the same table so the original creator sees every remix in one place
-- and every remix shares one credit path.
--
--   react       a recorded reaction post (source plays big, creator's camera
--               in a bubble)
--   react_live  a live stream showing the source as a studio source. The row
--               is active while it is on screen; viewers read it for the
--               "Reacting to @creator" chip.
--   duet, stitch  reserved for those modes.
--
-- The remix-links edge function owns every write (service role). It refuses a
-- link unless the source is a public, ungated video whose creator allows that
-- kind of remix (remix_settings).

CREATE TABLE IF NOT EXISTS public.remix_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('react', 'react_live', 'duet', 'stitch')),
  source_token_id bigint NOT NULL,
  source_address text NOT NULL,
  source_username text,
  source_title text NOT NULL DEFAULT '',
  -- The remix post. Null on a live reaction (the stream is the remix).
  remix_token_id bigint,
  -- The live post a react_live row belongs to.
  stream_token_id bigint,
  remixer_address text NOT NULL,
  remixer_username text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK ((kind = 'react_live') = (stream_token_id IS NOT NULL)),
  CHECK (kind = 'react_live' OR remix_token_id IS NOT NULL),
  CHECK (remix_token_id IS NULL OR remix_token_id <> source_token_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS remix_links_remix ON public.remix_links (remix_token_id) WHERE remix_token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS remix_links_source ON public.remix_links (source_token_id, created_at DESC);
-- One source on screen per stream at a time.
CREATE UNIQUE INDEX IF NOT EXISTS remix_links_live_active ON public.remix_links (stream_token_id) WHERE active;
CREATE INDEX IF NOT EXISTS remix_links_stream ON public.remix_links (stream_token_id, created_at DESC) WHERE stream_token_id IS NOT NULL;

ALTER TABLE public.remix_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remix_links FROM anon, authenticated;
GRANT ALL ON public.remix_links TO service_role;
-- Links are public: they only ever point at public posts.
GRANT SELECT ON public.remix_links TO anon, authenticated;
DROP POLICY IF EXISTS "Remix links are public" ON public.remix_links;
CREATE POLICY "Remix links are public" ON public.remix_links FOR SELECT TO anon, authenticated USING (true);

-- Who allows what. A row with token_id 0 is the creator's account default;
-- a row with a token_id is that post's own choice and wins over the default.
-- No row means allowed.
CREATE TABLE IF NOT EXISTS public.remix_settings (
  owner_address text NOT NULL,
  token_id bigint NOT NULL DEFAULT 0,
  allow_react boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_address, token_id)
);

ALTER TABLE public.remix_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remix_settings FROM anon, authenticated;
GRANT ALL ON public.remix_settings TO service_role;
GRANT SELECT ON public.remix_settings TO anon, authenticated;
DROP POLICY IF EXISTS "Remix settings are public" ON public.remix_settings;
CREATE POLICY "Remix settings are public" ON public.remix_settings FOR SELECT TO anon, authenticated USING (true);

-- What a feed card needs for a page of posts in one call: what each post is a
-- reaction to, and how many reactions each has.
CREATE OR REPLACE FUNCTION public.remix_link_summary(token_ids bigint[])
RETURNS TABLE (
  token_id bigint,
  reaction_of bigint,
  reaction_of_username text,
  reaction_of_title text,
  reactions bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (SELECT DISTINCT unnest(token_ids[1:100]) AS id)
  SELECT
    ids.id,
    l.source_token_id,
    l.source_username,
    l.source_title,
    (SELECT count(*) FROM public.remix_links r WHERE r.source_token_id = ids.id AND r.kind IN ('react', 'react_live'))
  FROM ids
  LEFT JOIN public.remix_links l ON l.remix_token_id = ids.id AND l.kind = 'react';
$$;

REVOKE ALL ON FUNCTION public.remix_link_summary(bigint[]) FROM public;
GRANT EXECUTE ON FUNCTION public.remix_link_summary(bigint[]) TO anon, authenticated, service_role;
