-- Custom emoji
-- ============
-- One platform-wide set of image emoji, typed as :shortcode: anywhere text is
-- written and rendered inline wherever it is read — the Slack/Discord/Mastodon
-- model, so a pack brought over from any of those keeps its names.
--
-- Anyone signed in can add one; the creator can remove their own. Shortcodes
-- are one namespace (first come, first served) because a :name: in a message
-- has to mean the same image to every reader. Standard emoji names (:fire:)
-- always resolve to the Unicode emoji first, so a custom one can never
-- repaint a character everybody already uses.
--
-- Images live in the public community-media bucket under custom-emojis/, or
-- stay on the provider's CDN (Discord, 7TV, BTTV, FFZ, a Mastodon instance)
-- when imported by URL.

CREATE TABLE IF NOT EXISTS public.custom_emojis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode text NOT NULL,
  image_url text NOT NULL,
  animated boolean NOT NULL DEFAULT false,
  -- Where it came from: upload, url, discord, slack, 7tv, bttv, ffz, mastodon, misskey …
  source text NOT NULL DEFAULT 'upload',
  -- The provider's own id (Discord emoji id, 7TV emote id), for re-sync.
  external_id text,
  category text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_emojis_shortcode_format
    CHECK (shortcode ~ '^[a-z0-9_+-]*[a-z][a-z0-9_+-]*$' AND char_length(shortcode) BETWEEN 2 AND 64),
  CONSTRAINT custom_emojis_image_url_https
    CHECK (image_url ~ '^https://' AND char_length(image_url) <= 2048)
);

CREATE UNIQUE INDEX IF NOT EXISTS custom_emojis_shortcode_key ON public.custom_emojis (shortcode);
CREATE INDEX IF NOT EXISTS custom_emojis_created_by_idx ON public.custom_emojis (lower(created_by));

ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read custom emojis" ON public.custom_emojis;
CREATE POLICY "Anyone can read custom emojis"
  ON public.custom_emojis FOR SELECT USING (true);

DROP POLICY IF EXISTS "Signed in users can add custom emojis" ON public.custom_emojis;
CREATE POLICY "Signed in users can add custom emojis"
  ON public.custom_emojis FOR INSERT
  WITH CHECK (get_request_wallet_address() <> '' AND lower(created_by) = get_request_wallet_address());

DROP POLICY IF EXISTS "Creators can remove their custom emojis" ON public.custom_emojis;
CREATE POLICY "Creators can remove their custom emojis"
  ON public.custom_emojis FOR DELETE
  USING (lower(created_by) = get_request_wallet_address());

GRANT SELECT ON public.custom_emojis TO anon, authenticated;
GRANT INSERT, DELETE ON public.custom_emojis TO anon, authenticated;
