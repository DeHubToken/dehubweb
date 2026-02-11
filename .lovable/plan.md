

## Fix "Unknown" Usernames in Image & Video Feed Mappers

### Problem
The `mapNFTToImagePost` and `mapNFTToVideoItem` functions in `src/hooks/use-dehub-feed.ts` are missing key fallback fields (`minterDisplayName`, `minterUsername`) when resolving creator names. Many API responses provide these fields instead of `mintername`, causing usernames to show as "unknown".

### Root Cause
- `mapNFTToImagePost` (line 187): only checks `nft.mintername || nft.creator?.username`
- `mapNFTToVideoItem` (line 98): checks `nft.minterDisplayName || nft.mintername` but skips `nft.minterUsername`
- Both functions' `creatorUsername` fields also miss `minterUsername`

Other mappers (ShortsFeed, SinglePostPage, mapNFTToLiveStream) already use the full chain: `minterDisplayName || minterUsername || mintername || creator?.display_name || creator?.username`.

### Fix
**File: `src/hooks/use-dehub-feed.ts`**

1. **`mapNFTToImagePost` username (line 187)**: Change from:
   ```
   nft.mintername || nft.creator?.username || 'unknown'
   ```
   To:
   ```
   nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.display_name || nft.creator?.username || 'unknown'
   ```

2. **`mapNFTToImagePost` creatorUsername (line 205)**: Change from:
   ```
   nft.mintername || nft.creator?.username
   ```
   To:
   ```
   nft.minterUsername || nft.mintername || nft.creator?.username
   ```

3. **`mapNFTToVideoItem` channel (line 98)**: Add `nft.minterUsername` between DisplayName and mintername:
   ```
   nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.display_name || nft.creator?.username || 'Unknown Creator'
   ```

4. **`mapNFTToVideoItem` creatorUsername (line 120)**: Change from:
   ```
   nft.mintername || nft.creator?.username
   ```
   To:
   ```
   nft.minterUsername || nft.mintername || nft.creator?.username
   ```

### Scope
One file changed: `src/hooks/use-dehub-feed.ts` -- four small edits to align fallback chains with the rest of the codebase.
