

## Problem

In multi-column (fullscreen/collapsed sidebar) mode, when `getAdaptiveShortsInsertIndex` returns `null` (not enough items to split) or returns `items.length`, `shouldSplitForShorts` is `false`. This causes the ShortsReel to render **before** all feed segments — placing it at the very top of the feed instead of interleaved within the content.

## Fix

In `src/components/app/feeds/HomeFeed.tsx`, modify the multi-column rendering logic (around lines 1056-1082):

1. **When `shouldSplitForShorts` is false**, move the ShortsReel from before the segments into the `fullWidthInserts` array so it gets interleaved between masonry grid segments like the other carousels (Leaderboard, Radio, Live).

2. Specifically:
   - Remove the unconditional shorts render at line 1063-1067
   - When `shouldSplitForShorts` is true: keep the current split behavior (beforeShorts → ShortsReel → afterShorts segments)
   - When `shouldSplitForShorts` is false: prepend the ShortsReel to the `fullWidthInserts` array so it appears after the first segment of content (same position as Leaderboard, just before it)

This ensures the Shorts carousel always appears **after** some feed content, never at the absolute top, regardless of how many items are loaded.

