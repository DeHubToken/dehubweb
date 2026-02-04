

# Fix Shorts Duration Filter

## Problem Identified

The shorts duration filter isn't working because the code is reading the wrong field from the API response.

**Current code (line 97):**
```typescript
const durationStr = nft.duration || '0:30';
```

**What the API actually returns:**
```json
{
  "videoDuration": 13.934,
  "videoDuration": 242.021566,
  "videoDuration": 87.539229,
  ...
}
```

The `duration` field doesn't exist - the API provides `videoDuration` as raw seconds (a number), not a formatted string. Since `nft.duration` is always `undefined`, every video gets a fallback of `'0:30'` (30 seconds), making all videos appear to be 30 seconds regardless of their actual length.

## Solution

Update `mapToShortVideo()` to use `videoDuration` directly instead of parsing a string:

### File to Modify

**`src/components/app/feeds/ShortsFeed.tsx`**

### Changes

1. **Read `videoDuration` directly as a number** (lines 96-97):
   ```typescript
   // Before:
   const durationStr = nft.duration || '0:30';
   
   // After:
   const durationSeconds = nft.videoDuration || nft.duration_seconds || 0;
   ```

2. **Remove the `parseDurationToSeconds` call** (line 124):
   ```typescript
   // Before:
   durationSeconds: parseDurationToSeconds(durationStr),
   
   // After:
   durationSeconds: Math.round(durationSeconds),
   ```

3. **Keep `parseDurationToSeconds` function** for backwards compatibility in case some data still uses the old format, but add a fallback check:
   ```typescript
   const durationSeconds = typeof nft.videoDuration === 'number' 
     ? nft.videoDuration 
     : parseDurationToSeconds(nft.duration || '0:00');
   ```

### Result

After this fix:
- A video with `videoDuration: 13.934` will have `durationSeconds: 14`
- The `< 15s` filter will correctly match videos under 15 seconds
- The `15-30s` filter will correctly match videos between 15-30 seconds
- etc.

