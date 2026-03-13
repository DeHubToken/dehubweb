

## Fix: Videos Not Playable on Search/Explore Page

### Root Cause

Two issues in `mapNFTToVideoItem` (`src/hooks/use-dehub-feed.ts`, lines 98-107):

1. **API-provided `videoUrl` is completely ignored.** The mapper always constructs the video URL from `tokenId` using the CDN pattern (`dehubcdn.../videos/${tokenId}.mp4`). But search API results may return items where:
   - `tokenId` is `0`, `undefined`, or a non-numeric MongoDB `_id` string
   - The item has a valid `videoUrl` field directly from the API that would work

2. **Text posts misclassified as videos.** `getContentType` (line 80) defaults to `'video'` when `postType` doesn't match known values (e.g., `feed-simple`, `feed-all`). These text posts render as `VideoCard` components with no `videoUrl`, showing a thumbnail + play button that does nothing on click.

### Fix

**`src/hooks/use-dehub-feed.ts`:**

1. In `mapNFTToVideoItem` — use the API's `videoUrl` field as a fallback when the CDN URL can't be constructed:
   ```typescript
   const videoUrl = isLivePost
     ? undefined
     : isAudioPost
       ? undefined
       : (tokenId
           ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${tokenId}.mp4`
           : getMediaUrl(nft.videoUrl) || undefined);
   ```

2. In `getContentType` — handle additional `postType` values from the search API and improve the default fallback:
   ```typescript
   // Handle feed-specific postType values from search API
   if (pt === 'feed-simple' || pt === 'feed-all' || pt === 'text') return 'image'; // text posts → ImageCard
   if (pt === 'feed-images') return 'image';
   if (pt === 'feed-video') return 'video';
   ```

These two changes ensure: (a) videos from search play correctly using the API-provided URL when tokenId is missing, and (b) text posts aren't rendered as broken video cards.

