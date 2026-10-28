-- Remix links: duets, stitches and reactions made from another creator's video.
--
-- The posts themselves live on the NestJS/Mongo side. A remix row says "this
-- post was made from that one", which is what gives the original its credit:
-- the "Duet with @creator" link, the Duets / Stitches / Reactions lists and
-- counts, the notification, and the share of tips (split_bps) the original
-- creator receives when someone tips the remix.
--
-- The remix-links edge function owns every write (service role). It checks the
-- source creator's allow setting, that the remix post is the caller's own, and
-- that the source is public and not gated before it records anything. Rows are
-- readable with the anon key so feeds, pages and share cards can show them.
--
-- A live reaction (kind 'react_live') has a row while the stream runs:
-- remix_token_id is null, stream_token_id is the live post and active is true.
-- When the replay becomes a post the row gets its remix_token_id.

CREATE TABLE IF NOT EXISTS public.remix_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('duet', 'stitch', 'react', 'react_live')),
  source_token_id bigint NOT NULL,
  source_address text NOT NULL,
  source_username text,
  remixer_address text NOT NULL,
  remixer_username text,
  remix_token_id bigint UNIQUE,
  stream_token_id bigint,
  active boolean NOT NULL DEFAULT true,
  -- Share of each tip on the remix that goes to the source creator, in basis points.
  split_bps integer NOT NULL DEFAULT 1000 CHECK (split_bps BETWEEN 0 AND 5000),
  -- Layout or other per-kind details (duet layout, stitch excerpt length...).
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remix_token_id IS NOT NULL OR stream_token_id IS NOT NULL),
  CHECK (remix_token_id IS NULL OR remix_token_id <> source_token_id)
);

CREATE INDEX IF NOT EXISTS remix_links_source ON public.remix_links (source_token_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS remix_links_remixer ON public.remix_links (remixer_address, created_at DESC);
CREATE INDEX IF NOT EXISTS remix_links_stream ON public.remix_links (stream_token_id) WHERE stream_token_id IS NOT NULL;

ALTER TABLE public.remix_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remix_links FROM anon, authenticated;
GRANT ALL ON public.remix_links TO service_role;
GRANT SELECT ON public.remix_links TO anon, authenticated;
DROP POLICY IF EXISTS "Remix links are public" ON public.remix_links;
CREATE POLICY "Remix links are public" ON public.remix_links
  FOR SELECT TO anon, authenticated USING (true);

-- Who may remix a creator's videos. token_id null is the account default; a
-- row for a token overrides it for that post. A null column inherits: post,
-- then account, then 'everyone'.
CREATE TABLE IF NOT EXISTS public.remix_settings (
  owner_address text NOT NULL,
  token_id bigint,
  allow_duet text CHECK (allow_duet IN ('everyone', 'followers', 'nobody')),
  allow_stitch text CHECK (allow_stitch IN ('everyone', 'followers', 'nobody')),
  allow_react text CHECK (allow_react IN ('everyone', 'followers', 'nobody')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS remix_settings_owner_token
  ON public.remix_settings (owner_address, (coalesce(token_id, -1)));
CREATE INDEX IF NOT EXISTS remix_settings_token ON public.remix_settings (token_id) WHERE token_id IS NOT NULL;

ALTER TABLE public.remix_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remix_settings FROM anon, authenticated;
GRANT ALL ON public.remix_settings TO service_role;
GRANT SELECT ON public.remix_settings TO anon, authenticated;
DROP POLICY IF EXISTS "Remix settings are public" ON public.remix_settings;
CREATE POLICY "Remix settings are public" ON public.remix_settings
  FOR SELECT TO anon, authenticated USING (true);

-- One row per source for the counts the cards and pages show.
CREATE OR REPLACE VIEW public.remix_counts WITH (security_invoker = true) AS
  SELECT source_token_id,
    count(*) FILTER (WHERE kind = 'duet' AND remix_token_id IS NOT NULL) AS duets,
    count(*) FILTER (WHERE kind = 'stitch' AND remix_token_id IS NOT NULL) AS stitches,
    count(*) FILTER (WHERE kind IN ('react', 'react_live') AND (remix_token_id IS NOT NULL OR active)) AS reactions
  FROM public.remix_links
  GROUP BY source_token_id;
GRANT SELECT ON public.remix_counts TO anon, authenticated, service_role;
