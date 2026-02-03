
# Fix: Persist Home Feed Shuffle Order Across Tab Switches

## Problem Identified

When you switch away from the Home feed and come back, the content order changes completely. This happens because:

1. The shuffled order is stored in `useRef` which resets when the component unmounts
2. When you return, the component remounts with empty refs
3. All posts are treated as "new" and reshuffled, giving a different order

## Solution

Store the shuffled order in **sessionStorage** so it persists across navigation within the same session. Pull-to-refresh will clear and regenerate the shuffle.

## Implementation

### File: `src/components/app/feeds/HomeFeed.tsx`

**Changes:**

1. **Add sessionStorage persistence for shuffled items**
   - Save shuffled items to sessionStorage after each shuffle
   - Load from sessionStorage on component mount
   - Use a stable key like `'home-feed-shuffled-items'`

2. **Modify the stable shuffle initialization**
   ```typescript
   // On mount, try to restore from sessionStorage
   const getInitialShuffledItems = (): FeedItemType[] => {
     try {
       const stored = sessionStorage.getItem('home-feed-shuffled-items');
       return stored ? JSON.parse(stored) : [];
     } catch {
       return [];
     }
   };
   
   const getInitialProcessedIds = (): Set<string> => {
     try {
       const stored = sessionStorage.getItem('home-feed-processed-ids');
       return stored ? new Set(JSON.parse(stored)) : new Set();
     } catch {
       return new Set();
     }
   };
   ```

3. **Persist after each shuffle operation**
   ```typescript
   // After adding new items to stableShuffledRef:
   try {
     sessionStorage.setItem('home-feed-shuffled-items', 
       JSON.stringify(stableShuffledRef.current));
     sessionStorage.setItem('home-feed-processed-ids', 
       JSON.stringify([...processedIdsRef.current]));
   } catch {}
   ```

4. **Clear on refresh (already happens on pull-to-refresh)**
   - The existing `shuffleKey` effect already clears refs
   - Add sessionStorage removal to that effect

5. **Clear when sort mode changes away from random**
   - When user switches from Random to Latest/Most Liked, clear the stored shuffle

### Technical Details

| Storage Key | Purpose |
|-------------|---------|
| `home-feed-shuffled-items` | JSON array of the shuffled FeedItemType items |
| `home-feed-processed-ids` | JSON array of already-processed item IDs |

**Why sessionStorage?**
- Persists across component unmounts
- Clears automatically when browser tab closes
- No database overhead
- Fast synchronous access

### Result

- Switching tabs and coming back shows the **same content in the same order**
- Pull-to-refresh gives a **fresh shuffle**
- Changing sort mode (Random → Latest) works as expected
- Content order is stable throughout your browsing session
