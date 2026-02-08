

# Fix Broken IPTV Channels - Server-Side Validation System

## Problem
The current Live TV system fetches ~700 channels from the Free-TV/IPTV GitHub playlist on the client side. While it filters out obvious bad patterns (YouTube, Twitch, HTTP-only, geo-restricted), many remaining channels have dead or broken stream URLs, leading to a poor user experience.

## Solution
Build a **backend channel validation system** that proactively tests every stream URL and only serves verified working channels to users. Additionally, add **community-driven broken channel reporting** so channels that break after validation get flagged and hidden automatically.

## How It Works

1. A backend function fetches the Free-TV playlist and tests each channel's stream URL by requesting the `.m3u8` manifest with a short timeout
2. Only channels that return a valid HLS manifest get stored in the database as "verified"
3. The app reads from this verified list instead of parsing the raw playlist
4. When a user encounters a broken channel during playback, it gets reported and hidden after enough reports

## Technical Details

### Step 1: Create Database Table

Create a `tv_channels_verified` table:
- `id` (text, primary key) - channel hash ID
- `name` (text) - channel name
- `logo` (text, nullable) - logo URL
- `category` (text) - country category code
- `stream_url` (text) - the HLS stream URL
- `country` (text) - country/group name
- `last_verified_at` (timestamptz) - when the stream was last confirmed working
- `broken_reports` (integer, default 0) - number of times users reported it broken
- `is_active` (boolean, default true) - whether to show this channel

RLS: public read access (no auth needed), no public write access.

### Step 2: Create `validate-tv-channels` Edge Function

A backend function that:
- Fetches the Free-TV GitHub playlist
- Parses all channels using existing M3U8 parsing logic
- Tests each stream URL in parallel batches (20 concurrent, 5-second timeout per request)
- A stream is "valid" if the HEAD/GET request returns a 200 status with content that looks like an HLS manifest
- Upserts working channels into the `tv_channels_verified` table
- Removes channels that fail validation
- Protected by a simple secret key to prevent abuse

### Step 3: Create `report-broken-channel` Edge Function

A lightweight endpoint that:
- Accepts a channel ID
- Increments the `broken_reports` counter
- If reports exceed a threshold (e.g., 3), marks the channel as `is_active = false`
- Rate-limited per channel to prevent spam

### Step 4: Update Client Code

Update `src/lib/api/live-tv.ts`:
- Primary source: read from `tv_channels_verified` table via the database client
- Fallback: if the table is empty (first run), fall back to existing playlist parsing
- Filter out channels where `is_active = false`

Update `src/components/app/tv/TVChannelCard.tsx`:
- On playback error (after retries exhausted), automatically call the `report-broken-channel` endpoint
- This creates a self-healing system where broken channels get reported and hidden

### Step 5: Initial Validation Run

After deploying the edge function, trigger it once to populate the database with verified channels. This initial run will test all ~700 channels and store only the working ones.

## Expected Outcome
- Users will only see channels that have been verified as working
- Channels that break after validation get community-reported and auto-hidden
- The channel list becomes a curated, reliable set that improves over time
- Fallback to the raw playlist ensures the system still works even if the database is empty

