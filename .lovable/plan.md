
# Remove Fake View Count Generator

## Problem Identified

The `getViewCount()` function in `src/lib/feed-utils.ts` generates **fake view counts** based on a hash of the post ID. When a video from the API has `views: null` or `views: undefined`, the code falls back to this fake generator, which can produce numbers like "33.3K" for posts that actually have 0 views.

This is why the specific "viral" account video shows "33.3K" views even though it has only 2 real views - the video data from the API likely has a null `views` field, triggering the fake fallback.

## Solution

Remove all usages of `getViewCount()` and replace with "0" when views data is missing. Real view counts should come from the API only.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/app/cards/VideoCard.tsx` | Replace `getViewCount(video.id)` fallback with `'0'` |
| `src/pages/app/SinglePostPage.tsx` | Replace `getViewCount()` fallbacks with `'0'` in all 3 mapper functions |
| `src/lib/feed-utils.ts` | Remove or deprecate the `getViewCount()` function |
| `src/lib/index.ts` | Remove `getViewCount` from exports |

## Changes in Detail

### 1. VideoCard.tsx (line 763)
```tsx
// Before:
viewCount={video.views?.replace(' views', '') || getViewCount(video.id)} 

// After:
viewCount={video.views?.replace(' views', '') || '0'} 
```

### 2. SinglePostPage.tsx (lines 39, 80, 116)
```tsx
// Before:
const views = nft.views != null ? String(nft.views) : getViewCount(String(nft.tokenId));

// After:
const views = nft.views != null ? String(nft.views) : '0';
```

### 3. feed-utils.ts - Remove function (lines 289-297)
Delete or comment out the entire `getViewCount` function to prevent future accidental usage.

### 4. index.ts - Remove export
Remove `getViewCount` from the exported utilities list.

---

## Technical Notes

The fake generator formula was:
```typescript
const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
const views = Math.floor((seed * 1234) % maxViews) + minViews;
// With maxViews=100000 and minViews=500, this could produce 500-100,500
```

Different post IDs would produce different fake values between 500 and ~100K, formatted as "33.3K", "12.5K", etc.
