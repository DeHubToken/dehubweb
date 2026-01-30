

# Fix Live TV Streams - Implementation Plan

## Problem Identified

The TV channels show "Stream unavailable" because the current implementation incorrectly matches streams to channels.

### Root Cause
The `streams.json` API has two types of entries:
1. **Linked streams** - Have `channel: "ChannelID.cc"` that matches entries in `channels.json`
2. **Orphan streams** - Have `channel: null` but include `title` and `url` directly

The current code only creates `TVChannel` objects from `channels.json` entries that have matching streams. However, streams with `channel: null` (orphan streams) are ignored entirely, and the linking between streams with valid `channel` IDs and the `channels.json` may not be working as expected.

## Solution

Update `src/lib/api/live-tv.ts` to:

1. **Support orphan streams** - Create `TVChannel` objects directly from stream entries that have `channel: null`
2. **Improve stream matching** - Build channels from streams first, then enrich with metadata from `channels.json` when available
3. **Update the API interface** - Handle the new `referrer` and `user_agent` fields for streams that require them

## Technical Changes

### File: `src/lib/api/live-tv.ts`

**Update `IPTVStream` interface to match actual API:**
```typescript
interface IPTVStream {
  channel: string | null;  // Can be null!
  feed: string | null;
  title: string;           // Always present
  url: string;
  referrer: string | null; // Renamed from http_referrer
  user_agent: string | null;
  quality: string | null;
}
```

**Add fields to `TVChannel` for playback headers:**
```typescript
export interface TVChannel {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  streamUrl: string;
  country: string;
  languages: string[];
  referrer?: string | null;   // For streams requiring referrer
  userAgent?: string | null;  // For streams requiring user-agent
}
```

**Rewrite `getTVChannelsByCategory()` logic:**

Instead of:
1. Fetch channels → Fetch streams → Match channels to streams

Do:
1. Fetch streams → Build channel map from `channels.json` → Create TVChannel from each stream (using channel metadata when available, falling back to stream title for orphans)

This ensures ALL streams with valid URLs are included, not just those that match the channel database.

**New matching strategy:**
```typescript
// Start from streams (source of truth for playable content)
for (const stream of streams) {
  // Skip if no valid URL
  if (!stream.url) continue;
  
  let tvChannel: TVChannel;
  
  if (stream.channel && channelMap.has(stream.channel)) {
    // Linked stream - use channel metadata
    const channelMeta = channelMap.get(stream.channel)!;
    tvChannel = {
      id: channelMeta.id,
      name: channelMeta.name,
      logo: channelMeta.logo,
      category: channelMeta.categories[0] || 'general',
      streamUrl: stream.url,
      country: channelMeta.country,
      languages: channelMeta.languages,
      referrer: stream.referrer,
      userAgent: stream.user_agent,
    };
  } else {
    // Orphan stream - create from stream data
    tvChannel = {
      id: `orphan-${generateId(stream.url)}`,
      name: stream.title,
      logo: null,
      category: 'general',  // No category info available
      streamUrl: stream.url,
      country: 'INT',  // International
      languages: [],
      referrer: stream.referrer,
      userAgent: stream.user_agent,
    };
  }
  
  channels.push(tvChannel);
}
```

### File: `src/components/app/tv/TVChannelCard.tsx`

**Add referrer/user-agent support for HLS.js:**
```typescript
if (Hls.isSupported()) {
  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 90,
    xhrSetup: (xhr) => {
      if (channel.referrer) {
        xhr.setRequestHeader('Referer', channel.referrer);
      }
      // Note: User-Agent cannot be set via XHR in browsers
    },
  });
  // ...
}
```

## Additional Improvements

1. **Filter by quality** - Prefer higher quality streams (720p, 1080p) when multiple are available for the same channel
2. **Deduplicate channels** - If multiple streams exist for the same channel ID, pick the best quality one
3. **Better error handling** - Show specific error messages based on stream failure type

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/api/live-tv.ts` | Fix stream-to-channel matching, support orphan streams, add referrer/user-agent fields |
| `src/components/app/tv/TVChannelCard.tsx` | Pass referrer header to HLS.js xhr setup |

## Expected Outcome

After these changes:
- Hundreds of TV channels will be available and playable
- Orphan streams (those without linked channel metadata) will appear with their title as the channel name
- Streams requiring referrer headers will work correctly
- Category filtering will work for linked channels, orphan streams will appear under "All"

