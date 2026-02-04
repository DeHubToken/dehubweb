

# Improve Home Feed Diversity

## Current Situation

The home feed currently shows content sorted by:
- **Trending** (default) - engagement + time decay algorithm
- **Most Liked** - all-time popular posts
- **Most Viewed** - highest view counts
- **Most Comments** - most discussed
- **Latest** - newest first

The problem is that the same popular creators tend to dominate the feed, especially in "Most Liked" and "Most Viewed" modes, because their content consistently gets high engagement.

## Proposed Solutions

### 1. Creator Diversity Limiting (Recommended)

Limit how many posts from the same creator can appear in a single feed page. This ensures variety without changing the sort order.

**How it works:**
- Maximum 2-3 posts per creator per page (configurable)
- When a creator exceeds the limit, their extra posts are pushed to later pages
- Users still see the best content, but from a wider variety of creators

### 2. "Discover" Mode

Add a new sort option focused on surfacing content from creators you don't usually see:
- Prioritize posts from creators with fewer followers
- Weight content from accounts the user hasn't interacted with before
- Boost posts from newer creators (accounts < 30 days old)

### 3. "Following Only" Feed Tab

Add a dedicated tab/filter to show only content from creators the user follows:
- Requires user authentication
- Uses the existing `address` API parameter to filter
- Provides a personalized experience separate from the global discovery feed

### 4. Enhanced Trending Algorithm

Improve the current trending score to include diversity factors:
- Penalize creators who already have posts in the feed
- Boost posts from underrepresented categories
- Factor in creator diversity score (variety of content types)

## Implementation Approach

I recommend implementing **Creator Diversity Limiting** first as it provides the most impact with least complexity:

```text
+-------------------+     +------------------+     +----------------+
|  API Response     | --> | Diversity Filter | --> | Rendered Feed  |
| (sorted by score) |     | (max 2/creator)  |     | (varied content)|
+-------------------+     +------------------+     +----------------+
```

### Files to Modify

1. **`src/lib/feed-utils.ts`**
   - Add `limitCreatorDiversity()` function
   - Configurable max posts per creator (default: 2)

2. **`src/components/app/feeds/HomeFeed.tsx`**
   - Apply diversity filter after sorting
   - Add optional "Discover" sort mode

3. **`src/hooks/use-unified-feed.ts`**
   - Add "Following" filter option that passes user's wallet address

### Optional Additions

- **"For You" personalized feed** - requires tracking user interactions (likes, views, follows) and building recommendation logic
- **Category-based diversity** - ensure mix of video, image, and text posts from different topics

## Technical Implementation

### Creator Diversity Filter

```typescript
function limitCreatorDiversity<T extends { creatorId?: string }>(
  items: T[],
  maxPerCreator: number = 2
): T[] {
  const creatorCounts = new Map<string, number>();
  const result: T[] = [];
  const deferred: T[] = [];
  
  for (const item of items) {
    const creatorId = item.creatorId || 'unknown';
    const count = creatorCounts.get(creatorId) || 0;
    
    if (count < maxPerCreator) {
      result.push(item);
      creatorCounts.set(creatorId, count + 1);
    } else {
      deferred.push(item);
    }
  }
  
  // Append deferred items at the end
  return [...result, ...deferred];
}
```

### UI Additions

- Add "Discover" chip to sort options
- Add "Following" toggle in filter section (requires login)
- Show "Shuffle" button to randomize within current sort

