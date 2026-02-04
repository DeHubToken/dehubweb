
# Plan: Fix Like State Not Persisting in ActionBar

## Root Cause Identified

The `ActionBar.tsx` component has a **React state synchronization bug**. It uses `useState` for like/dislike state:

```typescript
// Lines 91-94: Initial values only captured on MOUNT
const [isLiked, setIsLiked] = useState(initialIsLiked);
const [isDisliked, setIsDisliked] = useState(initialIsDisliked);
const [localLikeCount, setLocalLikeCount] = useState(likeCount ?? 0);
const [localDislikeCount, setLocalDislikeCount] = useState(dislikeCount ?? 0);
```

**Problem**: `useState(initialValue)` only runs once when the component mounts. When:
1. The page loads with stale/cached data → `isLiked: false`
2. React Query refetches with fresh data (after auth or cache refresh) → API returns `isLiked: true`
3. The **props update** but the **local state stays false**

This explains why "some likes work but not all":
- **Works**: When you navigate to a fresh page and the component mounts with the correct initial data
- **Fails**: When the component is already mounted and receives updated props (e.g., after cache invalidation or auth change)

## Solution

Add `useEffect` hooks to synchronize local state when props change from the parent feed.

### File to Modify

**`src/components/app/cards/ActionBar.tsx`**

Add these sync effects after the existing state declarations (around line 98):

```typescript
import { useState, useCallback, useEffect } from 'react';

// ... existing code ...

const [isLiked, setIsLiked] = useState(initialIsLiked);
const [isDisliked, setIsDisliked] = useState(initialIsDisliked);
const [localLikeCount, setLocalLikeCount] = useState(likeCount ?? 0);
const [localDislikeCount, setLocalDislikeCount] = useState(dislikeCount ?? 0);
const [isVoting, setIsVoting] = useState(false);
const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);

// NEW: Sync local state with props when they change (e.g., after data refetch)
useEffect(() => {
  setIsLiked(initialIsLiked);
}, [initialIsLiked]);

useEffect(() => {
  setIsDisliked(initialIsDisliked);
}, [initialIsDisliked]);

useEffect(() => {
  setLocalLikeCount(likeCount ?? 0);
}, [likeCount]);

useEffect(() => {
  setLocalDislikeCount(dislikeCount ?? 0);
}, [dislikeCount]);
```

### Changes Summary

1. **Add `useEffect` import** - Update the import statement to include `useEffect`
2. **Add 4 sync effects** - Each effect watches one prop and updates the corresponding local state

## Why This Fix Works

- When the feed data refreshes with authenticated user's vote state, the props will update
- The `useEffect` hooks will detect the prop changes and update local state accordingly
- The UI will immediately reflect the correct liked/disliked state
- Optimistic updates during voting will still work correctly since we're only syncing from props, not overwriting during active voting

## Expected Outcome

After this fix:
- Like buttons will correctly show filled/unfilled based on your previous votes
- Refreshing the page will maintain the correct like state
- Logging in will trigger a refetch, and previously liked items will show as liked
- Navigating between feeds and posts will preserve correct like states
