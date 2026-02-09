

# Merge "VOD Italy" Channels into "Italy"

## What changes

There are currently two Italy-related channel groups in the TV section:
- **Italy** — 231 channels
- **VOD Italy** — 68 channels

All 68 "VOD Italy" channels will be moved under the single "Italy" filter, resulting in one unified "Italy" group with ~299 channels. The "VOD Italy" filter pill will disappear entirely.

## Steps

### 1. Database migration
Run a SQL migration to update all `tv_channels_verified` rows where `country = 'VOD Italy'` to `country = 'Italy'`.

```text
UPDATE tv_channels_verified
SET country = 'Italy', updated_at = now()
WHERE country = 'VOD Italy';
```

### 2. Clean up display override
In `src/lib/api/live-tv.ts`, remove the `'VOD Italy': 'VOD Italy'` entry from the `COUNTRY_DISPLAY_OVERRIDES` map (line 44), since the country will no longer exist in the data.

### 3. Clear client cache
No code change needed — the in-memory cache (`channelsCache`) has a 5-minute TTL and will refresh automatically. Users will see the merged list on next load.

## Result
- One "Italy" pill in the country filter showing ~299 channels
- "VOD Italy" pill no longer appears
- All former VOD Italy channels are fully browsable under Italy
