

# Fix Likes Not Registering Across All Content Types

## Problem Summary
Likes aren't registering because the voting state (`isLiked`/`isDisliked`) is not being properly passed through the data pipeline. This affects **all content types** (videos, images, text posts, and shorts).

## Root Cause Analysis

The voting state comes from the DeHub API when you include your wallet `address` in the request. However, this data is getting lost at multiple points:

### Issue 1: Missing `isDisliked` in Feed Data Types
The `UnifiedFeedItem` interface only declares `isLiked`, but not `isDisliked`:
```typescript
// Current (broken)
isLiked?: boolean;
isSaved?: boolean;
```

### Issue 2: Data Mappers Don't Pass `isDisliked`
The mapping functions only pass `isLiked`:
- `mapToVideoItem` → sets `isLiked` but not `isDisliked`
- `mapToImagePost` → sets `isLiked` but not `isDisliked`
- `mapToTextPost` → doesn't set either field

### Issue 3: TextPost Type Missing Vote Fields
The `TextPost` interface doesn't include `isLiked`/`isDisliked` properties at all.

### Issue 4: PostCard Component Doesn't Pass Vote State
The `PostCard` calls `ActionBar` but doesn't pass the vote state:
```tsx
// Current (broken)
<ActionBar 
  postId={post.id} 
  likeCount={post.stats.likes}
  commentCount={post.stats.comments}
  // Missing: isLiked={post.isLiked} isDisliked={post.isDisliked}
/>
```

### Issue 5: ShortsViewer Resets State Incorrectly
On each video change, it resets the vote state to `false` instead of reading from the short's data:
```typescript
// Current (broken)
setIsLiked(false);
setIsDisliked(false);
```

---

## Technical Implementation Plan

### Step 1: Update UnifiedFeedItem Interface
**File:** `src/hooks/use-unified-feed.ts`

Add the missing `isDisliked` field:
```typescript
isLiked?: boolean;
isDisliked?: boolean;  // ADD THIS
isSaved?: boolean;
```

### Step 2: Update TextPost Type Definition
**File:** `src/types/feed.types.ts`

Add vote state fields to the TextPost interface:
```typescript
export interface TextPost extends BaseFeedItem {
  // ... existing fields ...
  stats: { ... };
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
}
```

### Step 3: Fix All Data Mappers
**File:** `src/hooks/use-unified-feed.ts`

Update `mapToVideoItem`:
```typescript
isLiked: item.isLiked ?? false,
isDisliked: item.isDisliked ?? false,  // ADD THIS
```

Update `mapToImagePost`:
```typescript
isLiked: item.isLiked ?? false,
isDisliked: item.isDisliked ?? false,  // ADD THIS
```

Update `mapToTextPost`:
```typescript
stats: { ... },
isLiked: item.isLiked ?? false,  // ADD THIS
isDisliked: item.isDisliked ?? false,  // ADD THIS
```

### Step 4: Fix PostCard Component
**File:** `src/components/app/cards/PostCard.tsx`

Pass vote state to ActionBar:
```tsx
<ActionBar 
  postId={post.id} 
  className="p-0"
  onComment={() => setShowComments(prev => !prev)}
  isLiked={post.isLiked}      // ADD THIS
  isDisliked={post.isDisliked} // ADD THIS
  likeCount={post.stats.likes}
  commentCount={post.stats.comments}
  isOptimistic={post.isOptimistic}
/>
```

### Step 5: Fix ShortsViewer Vote State
**File:** `src/components/app/cards/ShortsViewer.tsx`

Read initial vote state from the short's data instead of resetting to false:
```typescript
useEffect(() => {
  setIsLiked(currentShort?.isLiked ?? false);
  setIsDisliked(currentShort?.isDisliked ?? false);
  // ... rest of the effect
}, [currentIndex, currentShort]);
```

Also need to add `isLiked` and `isDisliked` to the ShortVideo type in feed.types.ts.

### Step 6: Update ShortVideo Type
**File:** `src/types/feed.types.ts`

Add vote fields to ShortVideo:
```typescript
export interface ShortVideo extends BaseFeedItem {
  // ... existing fields ...
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
}
```

### Step 7: Update Post Cache Utility
**File:** `src/lib/post-cache.ts`

Ensure the cache round-trip preserves vote state for text posts in `textPostToNFT`.

---

## Files to Modify (6 files)

| File | Changes |
|------|---------|
| `src/hooks/use-unified-feed.ts` | Add `isDisliked` to interface; update all 3 mappers |
| `src/types/feed.types.ts` | Add `isLiked`/`isDisliked` to TextPost and ShortVideo |
| `src/components/app/cards/PostCard.tsx` | Pass vote props to ActionBar |
| `src/components/app/cards/ShortsViewer.tsx` | Read vote state from short data |
| `src/lib/post-cache.ts` | Preserve vote state in text post cache |

## Expected Outcome
After these changes:
- Previously voted content will show filled thumbs up/down icons
- The ActionBar will correctly disable voting on already-voted content
- New votes will register and persist across navigation
- All content types (videos, images, text, shorts) will behave consistently

