
# Fix: Story View Counters Showing Wrong Numbers

## Problem Analysis

After investigating the story view tracking system, I found several issues causing incorrect view counts to be displayed:

### Issue 1: Optimistic Update Incorrect Logic
**Location**: `src/hooks/use-story-views.ts` (lines 87-94)

When a view is recorded, the hook optimistically adds `+7` to the local cache:
```typescript
onSuccess: () => {
  const currentCount = viewCountCache.get(storyId) ?? 0;
  const newCount = currentCount + 7; // Apply 7x multiplier locally
  viewCountCache.set(storyId, newCount);
  queryClient.setQueryData(['story-views', storyId], newCount);
}
```

**Problem**: This adds 7 regardless of whether the database actually created a new record. If the user already viewed the story (upsert finds existing record), no new row is created, but the UI still shows +7.

### Issue 2: Anonymous User ID Generation
**Location**: `supabase/functions/stories-api/index.ts` (line 84)

```typescript
const viewerWallet = walletAddress || `anon-${crypto.randomUUID()}`;
```

Each anonymous request generates a NEW UUID, so the upsert will always insert a new row. Combined with potential client-side timing issues, this could lead to duplicate anonymous views.

### Issue 3: Missing useCallback on recordView
**Location**: `src/hooks/use-story-views.ts` (lines 103-108)

The `recordView` function is not wrapped in `useCallback`, causing a new function reference on every render. This can lead to unnecessary effect executions in `StoryViewerModal`.

### Issue 4: Stale Cache After Page Navigation
The in-memory `viewCountCache` may show stale values when navigating between stories or returning to a previously viewed story.

---

## Solution

### 1. Fix Optimistic Update Logic

Instead of blindly adding +7, invalidate the query to refetch the actual count from the database:

```typescript
onSuccess: () => {
  // Invalidate to refetch actual count instead of guessing
  queryClient.invalidateQueries({ queryKey: ['story-views', storyId] });
}
```

### 2. Add useCallback to recordView

Wrap the function in useCallback to prevent unnecessary re-renders:

```typescript
const recordView = useCallback(() => {
  if (storyId && !recordedViews.current.has(storyId)) {
    recordedViews.current.add(storyId);
    recordViewMutation.mutate();
  }
}, [storyId, recordViewMutation]);
```

### 3. Improve Anonymous ID Consistency (Optional)

Consider using a session-based anonymous ID stored in localStorage/sessionStorage rather than generating a new UUID for each request. This would prevent duplicate views from the same anonymous browser session.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/use-story-views.ts` | Fix optimistic update, add useCallback wrapper |

---

## Technical Details

### Fixed Hook Code

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRef, useEffect, useCallback } from 'react';

const STORIES_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stories-api`;

const viewCountCache = new Map<string, number>();

export function useStoryViews(storyId: string | undefined) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const recordedViews = useRef<Set<string>>(new Set());

  const { data: fetchedCount, isLoading } = useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async (): Promise<number> => {
      if (!storyId) return 0;

      const response = await fetch(`${STORIES_API_URL}/views?story_id=${storyId}`);
      if (!response.ok) {
        console.error('[story-views] Error fetching view count');
        return viewCountCache.get(storyId) ?? 0;
      }

      const data = await response.json();
      const count = data.result?.count ?? 0;
      
      viewCountCache.set(storyId, count);
      return count;
    },
    enabled: !!storyId,
    staleTime: 30000, // Reduce stale time to 30 seconds for fresher data
    gcTime: 300000,
  });

  const viewCount = storyId 
    ? (fetchedCount ?? viewCountCache.get(storyId) ?? null)
    : 0;

  useEffect(() => {
    if (storyId && fetchedCount !== undefined) {
      viewCountCache.set(storyId, fetchedCount);
    }
  }, [storyId, fetchedCount]);

  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!storyId) throw new Error('Missing story ID');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (walletAddress) {
        headers['x-wallet-address'] = walletAddress.toLowerCase();
      }

      const response = await fetch(`${STORIES_API_URL}/views`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ story_id: storyId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to record view');
      }

      return response.json();
    },
    onSuccess: () => {
      // Refetch actual count from server instead of optimistic guess
      if (storyId) {
        queryClient.invalidateQueries({ queryKey: ['story-views', storyId] });
      }
    },
    onError: (err) => {
      console.error('[story-views] Error recording view:', err);
    },
  });

  // Wrap in useCallback to prevent unnecessary effect re-runs
  const recordView = useCallback(() => {
    if (storyId && !recordedViews.current.has(storyId)) {
      recordedViews.current.add(storyId);
      recordViewMutation.mutate();
    }
  }, [storyId, recordViewMutation]);

  return {
    viewCount: viewCount ?? 0,
    isLoading: isLoading && viewCount === null,
    recordView,
  };
}
```

---

## Testing Checklist

- View a story and verify the view count increments correctly
- Navigate to another story and back - verify counts remain accurate
- Test as both logged-in and anonymous user
- Verify the count matches the database value (actual views × 7)

