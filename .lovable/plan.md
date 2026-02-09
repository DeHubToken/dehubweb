

# Fix: Ad Video Avatar Broken in RelatedVideosFeed

## Problem

The `toVideoItem` function in `RelatedVideosFeed.tsx` builds the avatar URL using `getMediaUrl(nft.minterAvatarUrl)`, which is the generic media URL helper. However, avatars need special handling -- the API often returns relative paths or `api.dehub.io` URLs that must be normalized to the CDN format (`dehubcdn.../avatars/{address}.{ext}`).

The rest of the codebase uses `buildAvatarUrl(address, extractAvatarPath(nft))` from `src/lib/media-url.ts` for exactly this purpose, but the ad video's `toVideoItem` skips that.

## Fix

### File: `src/components/app/feeds/RelatedVideosFeed.tsx`

1. Import `buildAvatarUrl` and `extractAvatarPath` from `@/lib/media-url`.
2. In the `toVideoItem` function, replace:
   ```
   channelAvatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
   ```
   with:
   ```
   channelAvatar: buildAvatarUrl(nft.minter, extractAvatarPath(nft)) || '/placeholder.svg',
   ```

This uses the canonical avatar builder with the minter's wallet address, which correctly normalizes all API avatar path formats to the working CDN URL.

