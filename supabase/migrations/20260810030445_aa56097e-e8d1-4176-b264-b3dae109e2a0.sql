ALTER TABLE public.feature_requests
ADD COLUMN IF NOT EXISTS shipped_url text;

COMMENT ON COLUMN public.feature_requests.shipped_url IS
  'Optional internal DeHub path opened from the shipped-request notification.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feature_requests_shipped_url_internal_path'
      AND conrelid = 'public.feature_requests'::regclass
  ) THEN
    ALTER TABLE public.feature_requests
    ADD CONSTRAINT feature_requests_shipped_url_internal_path
    CHECK (shipped_url IS NULL OR (shipped_url LIKE '/%' AND shipped_url NOT LIKE '//%'));
  END IF;
END
$$;

UPDATE public.feature_requests
SET shipped_url = CASE
  WHEN title ILIKE 'Earnings comparison dashboard%' THEN '/app/command-centre'
  WHEN title ILIKE 'Endpoint for tipping comments%' THEN '/docs/endpoints'
  WHEN title ILIKE 'Auto-convert ETH to DHB for PPV%' THEN '/app/buy'
  WHEN title ILIKE 'Auto-buy DHB from Uniswap for tips%' THEN '/app/buy'
  WHEN title ILIKE 'clarity in notification panel' THEN '/app/notifications'
  ELSE shipped_url
END
WHERE shipped_url IS NULL
  AND (
    title ILIKE 'Earnings comparison dashboard%'
    OR title ILIKE 'Endpoint for tipping comments%'
    OR title ILIKE 'Auto-convert ETH to DHB for PPV%'
    OR title ILIKE 'Auto-buy DHB from Uniswap for tips%'
    OR title ILIKE 'clarity in notification panel'
  );