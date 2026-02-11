

## Fix "Unknown" Author on Single Post Page

### Problem
When viewing post 2776 (and potentially others), the author shows as "unknown" because the API response for this post provides creator info in the `creator` object (e.g., `creator.username`, `creator.display_name`) rather than in the flat `minterDisplayName`/`minterUsername`/`mintername` fields. The feed components already handle this fallback, but `SinglePostPage.tsx` does not.

### Root Cause
The four transformation functions in `SinglePostPage.tsx` (`toVideoItem`, `toImagePost`, `toTextPost`, `toLiveStream`) only check flat fields:
```
nft.minterDisplayName || nft.minterUsername || nft.mintername || 'Unknown'
```

Feed components (VideosFeed, ShortsFeed, MusicFeed, HomeFeed) additionally check:
```
nft.creator?.display_name || nft.creator?.username
```

### Fix
**File: `src/pages/app/SinglePostPage.tsx`**

Update all four transform functions to include `creator` and `owner` fallbacks, matching the pattern used in feed components:

1. **Name resolution** (in all 4 functions): Change from:
   ```
   nft.minterDisplayName || nft.minterUsername || nft.mintername || 'Unknown'
   ```
   To:
   ```
   nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.display_name || nft.creator?.username || nft.owner?.username || 'Unknown'
   ```

2. **Username/handle resolution** (in `toVideoItem`, `toTextPost`): Add creator fallback:
   ```
   nft.minterUsername || nft.mintername || nft.creator?.username || nft.owner?.username
   ```

3. **Creator ID resolution**: Add fallback:
   ```
   nft.minter || nft.creator?.id || nft.creator?.address
   ```

4. **Avatar resolution**: Add creator avatar fallback in the `rawAvatarPath` logic where `extractAvatarPath` is called -- also try `extractAvatarPath(nft.creator)` as the feed components do.

### Scope
Only one file changes: `src/pages/app/SinglePostPage.tsx` -- four small edits within the existing transform functions.
