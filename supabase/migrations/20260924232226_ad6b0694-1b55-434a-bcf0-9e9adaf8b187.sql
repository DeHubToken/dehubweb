ALTER TABLE public.store_listings
  ADD COLUMN external_url text,
  ADD COLUMN pod_provider text,
  ADD CONSTRAINT store_listings_external_url_check
    CHECK (external_url IS NULL OR (left(external_url, 8) = 'https://' AND char_length(external_url) <= 2048)),
  ADD CONSTRAINT store_listings_pod_provider_check
    CHECK (pod_provider IS NULL OR pod_provider IN ('spring','zazzle','printful','fourthwall','printify','redbubble','other'));