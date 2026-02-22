

## Remove Stories Skeleton from Home Feed Loading State

Since the `StoriesBar` has been removed from the home feed, the loading skeleton should match -- no stories placeholder row on load.

### Changes

**File: `src/components/app/feeds/FeedSkeletons.tsx`**
- Remove the `<StoriesBarSkeleton />` call from inside `HomeFeedSkeleton` (line 258), so the loading state no longer shows a row of story circles.
- Keep the `StoriesBarSkeleton` export itself intact (it may be used elsewhere or needed when stories return).

**File: `src/components/app/feeds/HomeFeed.tsx`** (optional cleanup)
- Remove `StoriesBarSkeleton` from the import on line 16 since it's no longer directly referenced.

This is a two-line change -- one import tweak and one line removal.

