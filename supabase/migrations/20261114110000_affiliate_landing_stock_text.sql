-- Invite pages that were published with the stock headline, message or button
-- text kept a frozen copy of it. Clear those copies so the page follows the
-- current default. Text people wrote themselves is left as it is.
UPDATE public.affiliate_codes
SET landing_headline = NULL
WHERE landing_headline IS NOT NULL
  AND lower(regexp_replace(btrim(landing_headline), '[.![:space:]]+$', '')) IN ('join me on dehub', 'join me on riftn');

UPDATE public.affiliate_codes
SET landing_cta_label = NULL
WHERE landing_cta_label IS NOT NULL
  AND lower(regexp_replace(btrim(landing_cta_label), '[.![:space:]]+$', '')) IN ('join me on dehub', 'join me on riftn');

UPDATE public.affiliate_codes
SET landing_message = NULL
WHERE landing_message IS NOT NULL
  AND lower(regexp_replace(btrim(landing_message), '[.![:space:]]+$', '')) = 'create, share and earn on a platform built for creators and their communities';
