
# Fix Music Video Thumbnails Not Loading

## Problem Analysis
The music video thumbnails in the Music tab's carousel don't load correctly, while the same videos display fine on profile pages. 

**Root Cause:** The `MusicFeed.tsx` component uses `getMediaUrl()` which just prepends the CDN base to whatever raw path the API returns. Meanwhile, the profile page uses `buildImageUrl()` which constructs a **canonical URL** using the tokenId.

- **Profile page:** `buildImageUrl(tokenId, imageUrl)` → `https://dehubcdn.../images/{tokenId}.{ext}`
- **Music feed:** `getMediaUrl(imageUrl)` → `https://dehubcdn.../{raw-path}` (can be malformed)

When the API returns inconsistent paths (e.g., different folder prefixes, missing paths, or different formats), the canonical approach handles it correctly while the raw approach fails.

---

## Solution
Update the `mapNFTToVideoItem` function in `MusicFeed.tsx` to use `buildImageUrl()` instead of `getMediaUrl()` for thumbnail construction, matching the pattern used in the unified feed.

---

## Technical Changes

### File: `src/components/app/feeds/MusicFeed.tsx`

1. **Add import for `buildImageUrl`**
   ```typescript
   import { buildImageUrl, buildVideoUrl } from '@/lib/media-url';
   ```

2. **Update `mapNFTToVideoItem` function** (around lines 95-121)

   **Current code:**
   ```typescript
   return {
     ...
     thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
     ...
     videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url),
     ...
   };
   ```

   **Updated code:**
   ```typescript
   return {
     ...
     thumbnail: buildImageUrl(nft.tokenId, nft.imageUrl) || buildImageUrl(nft.tokenId, nft.thumbnail_url) || '',
     ...
     videoUrl: buildVideoUrl(nft.tokenId),
     ...
   };
   ```

This ensures:
- Thumbnails use the canonical `images/{tokenId}.{ext}` format
- Videos use the canonical `videos/{tokenId}.mp4` format
- Matches the pattern used in profile pages and home feed

---

## Summary
- **1 file modified:** `src/components/app/feeds/MusicFeed.tsx`
- **Changes:** Update thumbnail/video URL construction to use canonical builders
- **Impact:** Music video thumbnails will load consistently across all views
