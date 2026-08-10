-- Multiple attachments on feature requests and bug reports
-- ========================================================
-- A bug report is often only reproducible across several screenshots, but the
-- board could hold exactly one file per request. image_urls carries the full
-- set; image_url stays as the first attachment so existing readers (the mobile
-- app, the shipped-notification card) keep rendering something without needing
-- to ship in lockstep.

ALTER TABLE public.feature_requests
ADD COLUMN IF NOT EXISTS image_urls text[];

COMMENT ON COLUMN public.feature_requests.image_urls IS
  'Every attachment on the request, in submission order. image_url mirrors the first entry for older clients.';

-- Existing rows carry their single attachment in image_url only.
UPDATE public.feature_requests
SET image_urls = ARRAY[image_url]
WHERE image_urls IS NULL
  AND image_url IS NOT NULL;

-- A request with no attachments keeps NULL rather than {} so "has attachments"
-- is a single IS NOT NULL check on either column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feature_requests_image_urls_bounded'
      AND conrelid = 'public.feature_requests'::regclass
  ) THEN
    ALTER TABLE public.feature_requests
    ADD CONSTRAINT feature_requests_image_urls_bounded
    CHECK (
      image_urls IS NULL
      OR (cardinality(image_urls) BETWEEN 1 AND 6 AND array_position(image_urls, NULL) IS NULL)
    );
  END IF;
END
$$;