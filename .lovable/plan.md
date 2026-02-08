
# Fix Direct URL Post Page to Match Feed Navigation Experience

## Problem
When navigating to a post from the feed, data is pre-cached (via `cacheVideoForNavigation`, etc.) and the feed's normalization utilities (`buildAvatarUrl`, `buildImageUrl`, `buildFeedImageUrls`) produce properly formatted CDN URLs. However, when accessing a post URL directly (e.g., `/app/post/12345`), the `SinglePostPage` fetches raw API data via `getNFTInfo()` and runs its own normalization functions (`toVideoItem`, `toImagePost`, `toTextPost`) that have several gaps compared to the feed's mappers.

## Key Differences Identified

### 1. Avatar URL construction
- **Feed**: Uses `extractAvatarPath()` + `buildAvatarUrl(minter, path)` to construct canonical CDN avatar URLs
- **SinglePostPage**: Uses `getMediaUrl(nft.minterAvatarUrl)` which simply prepends the CDN base -- does NOT normalize avatar paths correctly (e.g., `statics/avatars/...` or `api.dehub.io` URLs won't resolve)

### 2. Image URL construction
- **Feed**: Uses `buildImageUrl(tokenId, imageUrl)` and `buildFeedImageUrls(imageUrls)` for canonical image paths
- **SinglePostPage**: Uses `getMediaUrl(nft.imageUrl)` which doesn't strip folder prefixes like `nfts/images/`

### 3. Username/handle resolution
- **Feed**: Prefers `minterUsername` over `mintername` for handles
- **SinglePostPage**: Only uses `mintername` -- misses the newer `minterUsername` field, potentially showing wallet addresses instead of usernames

### 4. View count formatting
- **Feed**: Uses `formatViews(item.views)` which produces `"1.2K views"` then strips `" views"` for display
- **SinglePostPage**: Uses `String(nft.views)` which produces raw numbers like `"1234"` -- inconsistent display

### 5. Loading state
- **Feed navigation**: Instant display via cached data
- **Direct URL**: Shows a plain `Loader2` spinner -- no skeleton/shimmer to match the polished feed experience

### 6. Missing `createdAt` passthrough
- **Feed ImagePost mapper**: Passes raw `createdAt` for caching
- **SinglePostPage `toImagePost`**: Sets `createdAt` field correctly, but `toTextPost` formats it with `formatTimeAgo` at the `createdAt` field level instead of passing raw timestamp (though this is minor since PostCard handles it)

## Plan

### Step 1: Fix avatar URL construction in SinglePostPage normalization

Update `toVideoItem`, `toImagePost`, `toTextPost`, and `toLiveStream` to use the same canonical avatar resolution as the feed:

```typescript
import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls } from '@/lib/media-url';
```

Replace all `getMediaUrl(nft.minterAvatarUrl)` calls with:
```typescript
const rawAvatarPath = extractAvatarPath(nft);
const avatar = rawAvatarPath 
  ? buildAvatarUrl(nft.minter, rawAvatarPath) || '/placeholder.svg'
  : '/placeholder.svg';
```

### Step 2: Fix image URL construction

Replace `getMediaUrl(nft.imageUrl)` with `buildImageUrl(nft.tokenId, nft.imageUrl)` for single images, and `buildFeedImageUrls(nft.imageUrls)` for multi-image arrays.

### Step 3: Fix username/handle resolution

Update all normalization functions to prefer `minterUsername` over `mintername`:
```typescript
creatorUsername: nft.minterUsername || nft.mintername,
channel: nft.minterDisplayName || nft.minterUsername || nft.mintername || 'Unknown',
```

### Step 4: Fix view count formatting

Replace `String(nft.views)` with `formatViews(nft.views || 0)` (stripping `" views"` suffix where needed) to match the feed's display format.

### Step 5: Replace spinner with skeleton loading state

Replace the plain `LoadingState` (Loader2 spinner) with content-type-aware skeleton components from `FeedSkeletons.tsx` to provide a polished shimmer effect matching the feed experience.

### Step 6: Import cleanup

Add the new imports (`buildAvatarUrl`, `extractAvatarPath`, `buildImageUrl`, `buildFeedImageUrls`, `formatViews`) and remove unused `getMediaUrl` import if fully replaced.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/app/SinglePostPage.tsx` | Update all normalization functions (toVideoItem, toImagePost, toTextPost, toLiveStream) to use canonical URL builders, fix username resolution, fix view count formatting, replace spinner with skeleton |

## Risks and Mitigations

- **No breaking changes**: The card components (`VideoCard`, `ImageCard`, `PostCard`) already consume the same typed interfaces -- only the data values change to be more consistent.
- **Backward compatibility**: The `getMediaUrl` function is still used elsewhere; only the SinglePostPage normalization switches to canonical builders.
- **Testing**: Should verify both feed-navigated and direct-URL post pages render identically for video, image, and text post types.
