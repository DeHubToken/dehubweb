CREATE TABLE IF NOT EXISTS public.custom_emojis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode text NOT NULL,
  image_url text NOT NULL,
  animated boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'upload',
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