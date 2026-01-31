
# Fix Shorts Username Display

## Problem
The Shorts viewer displays "@user" instead of actual usernames because the data mapping uses a non-existent field `minterUsername`. The correct API field is `mintername`.

## Root Cause
In `ShortsFeed.tsx` (line 123):
```typescript
creatorUsername: nft.minterUsername || nft.creator?.username || 'user',
```
- `minterUsername` doesn't exist in the API response
- Should be `mintername` which contains the actual username/handle

## Solution

### 1. Fix ShortsFeed.tsx mapping (line 123)
Change from:
```typescript
creatorUsername: nft.minterUsername || nft.creator?.username || 'user',
```
To:
```typescript
creatorUsername: nft.mintername || nft.creator?.username || 'user',
```

### 2. Verify HomeFeed.tsx and VideosFeed.tsx
Check and fix the same issue in these files if present - ensuring `creatorUsername` uses `mintername` (the handle) and not `minterDisplayName` (the display name).

### 3. Update DeHubNFT interface (optional)
Add `minterUsername` as an alias to document both field names if the API sometimes returns it.

## Files to Modify
- `src/components/app/feeds/ShortsFeed.tsx` - Fix `creatorUsername` mapping
- `src/components/app/feeds/HomeFeed.tsx` - Verify/fix if same issue exists
- `src/components/app/feeds/VideosFeed.tsx` - Verify/fix if same issue exists

## Technical Note
The API returns:
- `mintername` → The @username handle (e.g., "cryptodev42")
- `minterDisplayName` → The display name (e.g., "Crypto Developer")

The current code incorrectly looks for `minterUsername` which doesn't exist, causing the fallback to `'user'`.
