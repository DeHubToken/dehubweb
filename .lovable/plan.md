
# Fix: Ad Video "Format Not Supported" on Dedicated Post Page

## Problem Analysis

The ad video (ID 2008) plays correctly in feeds and profiles but shows "Video format not supported" when displayed in the Related Videos section under dedicated post pages.

### Root Cause

The codebase has **inconsistent video URL construction** across different components:

| Component | URL Construction | Result |
|-----------|-----------------|--------|
| `use-dehub-feed.ts` (feeds/profiles) | Canonical CDN pattern: `{CDN}/videos/{tokenId}.mp4` | Works |
| `RelatedVideosFeed.tsx` (ad video) | Raw API value: `getMediaUrl(nft.videoUrl)` | Fails |
| `SinglePostPage.tsx` (post page) | Raw API value: `getMediaUrl(nft.videoUrl)` | Fails |

The API may return video URLs pointing to files with unsupported codecs (H.265/HEVC) or different file formats. The canonical CDN pattern (`/videos/{tokenId}.mp4`) always points to browser-compatible transcoded files.

---

## Solution

Update the `toVideoItem()` functions in both `RelatedVideosFeed.tsx` and `SinglePostPage.tsx` to use the same canonical CDN URL pattern that works reliably in the main feeds.

---

## Implementation Details

### 1. RelatedVideosFeed.tsx

**Current code (line 40):**
```typescript
videoUrl: getMediaUrl(nft.videoUrl),
```

**Fix:**
```typescript
videoUrl: nft.tokenId 
  ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${nft.tokenId}.mp4` 
  : undefined,
```

### 2. SinglePostPage.tsx

**Current code (line 68):**
```typescript
videoUrl: getMediaUrl(nft.videoUrl),
```

**Fix:**
```typescript
videoUrl: nft.tokenId 
  ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${nft.tokenId}.mp4` 
  : undefined,
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/app/feeds/RelatedVideosFeed.tsx` | Update `toVideoItem()` to use canonical CDN URL |
| `src/pages/app/SinglePostPage.tsx` | Update `toVideoItem()` to use canonical CDN URL |

---

## Technical Notes

- The `DEHUB_CDN_BASE` constant is already available and can be imported
- This matches the proven pattern used in `use-dehub-feed.ts` line 92
- All videos on the CDN are transcoded to browser-compatible H.264 MP4 format
- This ensures cross-browser compatibility on desktop and mobile

---

## Testing Checklist

- Verify the ad video under post pages now plays correctly
- Verify videos still play correctly in the main feed
- Verify videos still play correctly on profile pages
- Test on both desktop and mobile browsers
