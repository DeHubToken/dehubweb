
# Audit: Outdated API Patterns Across All Integration Files

## Summary of Findings

After a thorough review of `dehub.ts`, `use-dehub-feed.ts`, `use-dehub-profile.ts`, `use-unified-feed.ts`, and all feed components, here are the outdated patterns found:

---

## Issue 1: Deprecated `address` Query Parameter (High Priority)

**Per the latest API docs**: The `address` query param is deprecated and ignored. Viewer context (isLiked, isSaved, isOwner, etc.) is now extracted from the JWT Bearer token in the Authorization header.

**Files still passing `address`:**

| File | Location |
|---|---|
| `src/hooks/use-unified-feed.ts` | `UnifiedFeedParams.address` field + line 367 setting it on URL |
| `src/hooks/use-dehub-profile.ts` | `useDeHubUserContent` - line 202-203 sets `address` param |
| `src/hooks/use-dehub-feed.ts` | Uses `searchNFTs` which accepts `address` in `SearchNFTsParams` |
| `src/lib/api/dehub.ts` | `SearchNFTsParams.address`, `UniversalSearchParams.address`, `getAccountInfo(address)`, `getNFTComments(address)`, `getFollowList(viewerAddress)` |
| `src/components/app/feeds/HomeFeed.tsx` | Passes `address: walletAddress` to `useDeHubVideos` |
| `src/components/app/feeds/ImagesFeed.tsx` | Passes `address: walletAddress` to `useDeHubImages` |
| `src/components/app/feeds/ShortsFeed.tsx` | Passes `address: walletAddress` |
| `src/components/app/feeds/MusicFeed.tsx` | Passes `address: walletAddress` to `searchNFTs` |
| `src/components/app/feeds/VideosFeed.tsx` | Passes `address: walletAddress` |
| `src/hooks/use-feed-prefetch.ts` | Passes `address: walletAddress` in multiple prefetch calls |

**Fix**: Remove `address` from `UnifiedFeedParams`, `SearchNFTsParams`, and all call sites for feed endpoints. The JWT token already provides viewer context. Note: `address` param on `account_info` and `follow_list` endpoints may still be valid for determining follow relationships -- these should be verified separately and kept if they serve a different purpose (viewer context for follow status).

---

## Issue 2: Legacy `totalVotes` Mapping (Medium Priority)

**Latest API**: Returns flat `likes` and `dislikes` fields on feed items. The nested `totalVotes.for` / `totalVotes.against` is the legacy format.

**Files still using `totalVotes` as primary:**

| File | Lines |
|---|---|
| `src/hooks/use-unified-feed.ts` | `UnifiedFeedItem` type defines `totalVotes` but not flat `likes`/`dislikes`; mappers use `item.totalVotes?.for` |
| `src/hooks/use-dehub-feed.ts` | `mapNFTToVideoItem` uses `nft.totalVotes?.for`; `mapNFTToImagePost` uses `nft.totalVotes?.for` |
| `src/lib/api/dehub.ts` | `DeHubNFT` interface defines `totalVotes` but no flat `likes`/`dislikes` |

**Fix**: Add flat `likes` and `dislikes` fields to `UnifiedFeedItem` and `DeHubNFT`. Update all mappers to prefer flat fields with `totalVotes` as fallback: `item.likes ?? item.totalVotes?.for ?? 0`.

---

## Issue 3: Missing New Response Fields (Medium Priority)

**Latest API returns these fields that are not mapped:**

- `isOwner` (boolean) -- whether viewer owns this content
- `isUnlocked` (boolean) -- whether viewer unlocked PPV content
- `minterUser` (object) -- full creator profile object
- `minterFollowers` / `minterFollowings` (numbers)
- `stream` (object) -- live stream metadata
- `isSaved` -- already partially handled

**Fix**: Add these fields to `UnifiedFeedItem` and `DeHubNFT` interfaces, and pass them through mappers where useful (e.g., `isOwner` can replace the manual `isOwnPost` check in card components).

---

## Issue 4: `status` Filter Missing `all` Option (Low Priority)

**Latest API**: The `status` param accepts `minted`, `signed`, or `all` (default). Current code only types `minted | pending | failed`.

**Fix**: Update `SearchNFTsParams.status` and `UnifiedFeedParams.status` to include `'all' | 'signed'` options.

---

## Issue 5: Missing `postType: 'live'` in Unified Feed (Low Priority)

**Latest API**: The `postType` filter supports `live` for livestream recordings. Current `UnifiedFeedParams.postType` and `UnifiedFeedItem.postType` don't include `'live'`.

**Fix**: Add `'live'` to the postType union types.

---

## Issue 6: `use-dehub-feed.ts` Still Uses Legacy `/api/search_nfts` (Low-Medium Priority)

The `useDeHubFeed` hook calls `searchNFTs` which hits `/api/search_nfts` with legacy params (`sortMode`, `unit`, `page` 0-indexed). The recommended endpoint is `/api/feed` with newer params (`sortBy`, `limit`, `page` 1-indexed).

**Affected consumers**: `HomeFeed` (shorts carousel), `ImagesFeed`, `ShortsFeed`, `MusicFeed` -- all still use `useDeHubFeed`/`useDeHubImages`/`useDeHubVideos` which go through the legacy endpoint.

**Fix**: Migrate these feed hooks to use the unified `/api/feed` endpoint via `useUnifiedFeed`, or at minimum update `searchNFTs` params to match the new API conventions. This is the largest change and could be done incrementally.

---

## Implementation Plan

### Step 1: Update Type Definitions
- Add flat `likes`/`dislikes`, `isOwner`, `isUnlocked`, `minterUser`, `stream` fields to `DeHubNFT` and `UnifiedFeedItem`
- Update `status` union types to include `'all' | 'signed'`
- Add `'live'` to `postType` unions

### Step 2: Remove Deprecated `address` Param from Feed Calls
- Remove `address` from `UnifiedFeedParams` interface
- Remove `address` from `fetchUnifiedFeedFromAPI`
- Remove `address` from `SearchNFTsParams` (for feed use)
- Remove `address` prop passing in all feed components: `HomeFeed`, `ImagesFeed`, `VideosFeed`, `ShortsFeed`, `MusicFeed`
- Remove `address` from `use-feed-prefetch.ts`
- Remove `address` from `useDeHubUserContent` in `use-dehub-profile.ts`

### Step 3: Update Mappers to Use New Fields
- Update `mapToVideoItem`, `mapToImagePost`, `mapToTextPost` in `use-unified-feed.ts` to prefer `likes`/`dislikes` over `totalVotes`
- Update `mapNFTToVideoItem`, `mapNFTToImagePost` in `use-dehub-feed.ts` similarly
- Pass through `isOwner`, `isSaved`, `isUnlocked` where useful

### Step 4: Clean Up Feed Components
- Remove `walletAddress` from feed component props where it was only used for the `address` param
- Simplify `useDeHubFeed` options that no longer need `address`

### Technical Notes
- The `address` param on `/api/account_info` and `/api/follow_list` endpoints likely still serves a purpose (determining follow relationship between two users). These will NOT be removed -- only feed-related `address` params.
- The JWT Bearer token is already being sent correctly in `apiCall` and `fetchUnifiedFeedFromAPI`, so viewer context will continue to work after removing the redundant `address` param.
- Backward compatibility with `totalVotes` will be maintained via fallback: `item.likes ?? item.totalVotes?.for ?? 0`.
