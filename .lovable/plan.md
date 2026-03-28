

# Add Pakistani TV Channels Support

## Problem
Pakistani TV channels are absent from the verified database because the validation function filters them out — most Pakistani TV streams from the playlist sources use `http://` (not HTTPS) or non-`.m3u8` stream formats, causing them to fail the `isValidStreamUrl` check.

## Solution
Relax the stream validation rules slightly and add a curated list of known-working Pakistani TV channel streams as a supplementary source.

### Changes

### 1. Edge Function: `supabase/functions/validate-tv-channels/index.ts`

**Allow HTTP streams from trusted domains**: Pakistani government broadcasters (e.g., `ptv.com.pk`, `radio.gov.pk`) and other known providers often only serve over HTTP. Add a whitelist of trusted domains where HTTP is acceptable:

```
const TRUSTED_HTTP_DOMAINS = [
  'ptv.com.pk',
  'arynews.tv',
  'geo.tv',
  'humtv.com',
  'radio.gov.pk',
];
```

Update `isValidStreamUrl` to allow HTTP for these trusted domains.

**Add curated Pakistani TV playlist source**: Add `https://iptv-org.github.io/iptv/countries/pk.m3u` as a third playlist source. The iptv-org project maintains per-country playlists that include Pakistani channels specifically (ARY News, Geo News, Hum TV, PTV, Express News, Dunya News, BOL News, Samaa TV, etc.).

### 2. Redeploy the edge function

After updating, trigger a re-validation to populate the database with Pakistani TV channels.

## Expected Result
After revalidation, Pakistani channels like ARY News, Geo News, PTV News, Hum TV, Express News, Dunya News, BOL News, and Samaa TV should appear in the TV section under a "Pakistan" country filter.

## Technical Detail
- The iptv-org country-specific playlist (`/countries/pk.m3u`) contains ~30-50 Pakistani channels
- Some may still fail stream validation if their servers are down, but the major news/entertainment channels should pass
- The country will be correctly mapped to category `pk` via the existing `COUNTRY_TO_CATEGORY` mapping

