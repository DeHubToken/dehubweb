

# Fix: Home Feed Looping Issue in Random Mode

## Problem

When scrolling in "Random" mode, you're seeing the same posts repeating as if it's a loop. This happens because:

1. **Re-shuffling on new pages**: When you scroll down and fetch new content, the entire feed gets re-shuffled. Posts you already saw can jump back to earlier positions.

2. **Random is called on every change**: The shuffle uses `Math.random()` which produces different results each time the list changes.

## Solution

Store the shuffled order once and only append new items to the end instead of re-shuffling everything.

## Implementation Details

### File: `src/components/app/feeds/HomeFeed.tsx`

**Changes:**

1. **Add a ref to store stable shuffled items**
   - Use `useRef` to keep track of already-shuffled items
   - Only shuffle newly added items and append them

2. **Track which item IDs have been shuffled**
   - Prevent the same item from appearing twice in the shuffled list
   - Use a Set to track processed IDs

3. **Modify the items useMemo**
   - Instead of reshuffling everything, only shuffle new items
   - Append new shuffled items to the existing stable list

**Code Pattern:**
```typescript
// Store stable shuffled items (persists across re-renders)
const stableShuffledRef = useRef<FeedItemType[]>([]);
const processedIdsRef = useRef<Set<string>>(new Set());

const items = useMemo((): FeedItemType[] => {
  if (selectedSort.value !== 'random') {
    // Non-random: return as-is
    return mappedItems;
  }
  
  // Find items not yet processed
  const newItems = mappedItems.filter(item => {
    const id = getItemId(item);
    return !processedIdsRef.current.has(id);
  });
  
  // Shuffle only the new items
  const shuffledNew = balancedShuffle(newItems);
  
  // Mark as processed
  shuffledNew.forEach(item => {
    processedIdsRef.current.add(getItemId(item));
  });
  
  // Append to stable list
  stableShuffledRef.current = [...stableShuffledRef.current, ...shuffledNew];
  
  return stableShuffledRef.current;
}, [feedData, selectedSort.value, hasPreFetched]);
```

4. **Reset refs on refresh**
   - When `shuffleKey` changes (pull-to-refresh), clear the refs to start fresh

## Result

- Scrolling down will show **new content only** at the bottom
- Previously seen items stay in their positions
- No more "looping" effect
- Pull-to-refresh still gives a fresh shuffle

## Technical Notes

| Before | After |
|--------|-------|
| Full reshuffle on each new page | Only shuffle new items, append to stable list |
| Items jump around randomly | Items stay in position once displayed |
| Perceived looping | Proper infinite scroll behavior |

