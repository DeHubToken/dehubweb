

# Fix: Story Views Flashing "0" Before Real Count Loads

## Problem
When a story first loads, the view count briefly shows "0" before the actual count arrives from the API. This happens because the hook defaults to `0` while the query is still in flight.

## Solution
Return `null` from the hook while the view count is still loading, and update the three render locations in `StoryViewerModal.tsx` to only display the view count once it has a real value.

## Technical Details

### File 1: `src/hooks/use-story-views.ts`
- Change the return type of `viewCount` from always-a-number to `number | null`
- Return `null` instead of `0` when no cached or fetched value is available yet
- Update `isLoading` to reflect this correctly

### File 2: `src/components/app/stories/StoryViewerModal.tsx`
- Wrap the three view count display locations (lines ~412-415, ~562-564, ~615-618) in a conditional that only renders when `viewCount !== null`
- This means the eye icon and count simply won't appear until the real number is ready -- no flash of "0"

