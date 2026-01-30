

# Improve TV Stream Reliability

## Problem Analysis

Based on investigation:
1. **Geo-restrictions (Ⓖ)** - Many streams only work in specific countries
2. **CORS blocking** - Stream servers block browser requests from unknown origins
3. **Unsupported formats** - Some use MPEG-DASH (`.mpd`) which HLS.js doesn't support
4. **Token expiration** - Some URLs have time-limited tokens
5. **The Free-TV playlist doesn't contain Spanish channels** - The Spain channels the user saw may be leftover cache from the old iptv-org source

## Solution: Use a CORS Proxy + Better Filtering

### 1. Add Stream Health Checking

Before displaying channels, test if they're actually reachable:

```typescript
async function isStreamHealthy(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
```

### 2. Use a CORS Proxy Backend Function

Create an edge function that proxies HLS streams to avoid CORS issues:

**File:** `supabase/functions/proxy-stream/index.ts`
```typescript
// Proxy requests to IPTV streams to bypass CORS
// Only proxy the manifest files, not the actual video segments
```

### 3. Filter Out Known-Bad Stream Types

Update `live-tv.ts` to filter more aggressively:
- Skip `.mpd` (DASH) streams - HLS.js doesn't support them
- Skip streams with expired tokens (containing `exp=` with past timestamps)
- Skip streams marked as geo-restricted (Ⓖ) for now
- Skip HTTP (non-HTTPS) streams which often fail in secure contexts

### 4. Add Lazy Stream Validation

Instead of pre-checking all streams (slow), validate on-demand when a card becomes visible and cache the result.

### 5. Clear the Cache

The Spanish channels appearing may be from browser cache of the old iptv-org API. Add cache-busting to force fresh data.

---

## Technical Changes

### File: `src/lib/api/live-tv.ts`

**Improve filtering:**
```typescript
function isValidStream(url: string, name: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerName = name.toLowerCase();
  
  // Skip non-HLS formats
  if (lowerUrl.includes('.mpd')) return false;
  
  // Skip YouTube/Twitch (already done)
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return false;
  if (lowerUrl.includes('twitch.tv')) return false;
  if (lowerUrl.includes('dailymotion.com')) return false;
  
  // Skip HTTP (mixed content issues)
  if (url.startsWith('http://')) return false;
  
  // Skip geo-restricted channels (marked with Ⓖ)
  if (name.includes('Ⓖ')) return false;
  
  // Only allow HLS streams
  return lowerUrl.includes('.m3u8');
}
```

**Add cache-busting:**
```typescript
const FREE_TV_PLAYLIST_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

async function fetchAllChannels(): Promise<TVChannel[]> {
  // Add cache-bust parameter
  const response = await fetch(FREE_TV_PLAYLIST_URL + `?_=${Date.now()}`);
  // ...
}
```

### File: `src/components/app/tv/TVChannelCard.tsx`

**Add retry logic and better error states:**
```typescript
const [retryCount, setRetryCount] = useState(0);
const MAX_RETRIES = 2;

const handleRetry = () => {
  if (retryCount < MAX_RETRIES) {
    setRetryCount(prev => prev + 1);
    setHasError(false);
    startPlayback();
  }
};
```

### File: `supabase/functions/proxy-stream/index.ts` (New)

Create a simple proxy edge function to help with CORS issues:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const streamUrl = url.searchParams.get('url');
  
  if (!streamUrl) {
    return new Response('Missing URL', { status: 400 });
  }
  
  try {
    const response = await fetch(streamUrl);
    const body = await response.text();
    
    return new Response(body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/x-mpegurl',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return new Response('Stream unavailable', { status: 502 });
  }
});
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/api/live-tv.ts` | Add stricter filtering (skip geo-restricted, HTTP, DASH), add cache-busting, skip channels with Ⓖ marker |
| `src/components/app/tv/TVChannelCard.tsx` | Add retry button, improve error handling |
| `supabase/functions/proxy-stream/index.ts` | New edge function to proxy streams and bypass CORS |

## Expected Outcome

- ~50-70% of remaining channels should work (those that are HTTPS + HLS + not geo-restricted)
- Better user experience with retry capability
- CORS proxy enables more streams to work in the browser

## Limitations

Some streams will always fail because:
- They're geo-restricted to specific countries
- They require authentication/tokens
- The source server is down
- Network conditions vary

This is inherent to aggregated IPTV playlists - they're community-maintained and reliability varies.

