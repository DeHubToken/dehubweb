
# Fix: True Random Shuffle with Balanced Content Ratio

## Current Problems

1. **Not truly random on page refresh**: The `randomSeed` is initialized once on component mount and only changes when pull-to-refresh is triggered. Browser refresh re-mounts the component with a new seed, but navigating away and back may reuse the same seed.

2. **No content ratio enforcement**: The shuffle treats all content equally - there's no guarantee of getting text posts mixed in with image/video posts.

## Solution

### 1. True Randomization on Every Render

Replace the seeded shuffle with `Date.now()` as the seed, ensuring every page load/refresh produces a completely different order.

### 2. Balanced Content Distribution Algorithm

Implement a "ratio shuffle" that:
1. Separates items into **text posts** and **media posts** (images/videos)
2. Enforces a **3:9 ratio** (1 text post for every 3 media posts)
3. Interleaves them randomly while maintaining the ratio

## Technical Implementation

### File: `src/components/app/feeds/HomeFeed.tsx`

**Step 1: New helper function for balanced shuffle**

```typescript
/**
 * Balanced shuffle: ensures ~3 text posts for every 9 media posts
 * Interleaves text posts throughout the feed at regular intervals
 */
function balancedShuffle<T extends { type: string }>(
  items: T[], 
  seed: number
): T[] {
  const random = seededRandom(seed);
  
  // Separate text posts from media posts
  const textPosts = items.filter(item => item.type === 'post');
  const mediaPosts = items.filter(item => item.type !== 'post');
  
  // Shuffle both arrays independently
  const shuffledText = [...textPosts];
  const shuffledMedia = [...mediaPosts];
  
  for (let i = shuffledText.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledText[i], shuffledText[j]] = [shuffledText[j], shuffledText[i]];
  }
  
  for (let i = shuffledMedia.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledMedia[i], shuffledMedia[j]] = [shuffledMedia[j], shuffledMedia[i]];
  }
  
  // Interleave: insert 1 text post after every 3 media posts
  const result: T[] = [];
  let textIndex = 0;
  let mediaIndex = 0;
  
  while (mediaIndex < shuffledMedia.length || textIndex < shuffledText.length) {
    // Add up to 3 media posts
    for (let i = 0; i < 3 && mediaIndex < shuffledMedia.length; i++) {
      result.push(shuffledMedia[mediaIndex++]);
    }
    
    // Add 1 text post if available
    if (textIndex < shuffledText.length) {
      result.push(shuffledText[textIndex++]);
    }
  }
  
  return result;
}
```

**Step 2: Update random seed generation**

Change line 341 from:
```typescript
const [randomSeed, setRandomSeed] = useState(() => Math.random());
```

To:
```typescript
// Generate new seed on every mount for true randomness
const [randomSeed, setRandomSeed] = useState(() => Date.now());
```

**Step 3: Update the items useMemo to use balanced shuffle**

Change lines 567-570 from:
```typescript
if (selectedSort.value === 'random') {
  const shuffleSeed = Math.floor((randomSeed + shuffleKey) * 10000);
  return shuffleArray(mappedItems, shuffleSeed);
}
```

To:
```typescript
if (selectedSort.value === 'random') {
  const shuffleSeed = Math.floor((randomSeed + shuffleKey) * 10000);
  return balancedShuffle(mappedItems, shuffleSeed);
}
```

## How the Ratio Works

| Media Posts | Text Posts | Result Pattern |
|-------------|------------|----------------|
| 3 | 1 | M M M T M M M T M M M T ... |
| 9 | 3 | Every 4th post is text (3:1 media-to-text) |
| 12 | 4 | 12 media + 4 text = 16 posts total |

If there are more or fewer text posts than the ratio requires:
- **More text posts**: Extra text posts get appended at the end
- **Fewer text posts**: Media posts continue without text inserts

## Summary of Changes

| Location | Change |
|----------|--------|
| Lines 72-90 | Add new `balancedShuffle()` helper function |
| Line 341 | Change `Math.random()` to `Date.now()` for true randomness |
| Lines 567-570 | Replace `shuffleArray` with `balancedShuffle` |

This ensures:
1. Every page load produces a truly different order
2. Text posts are evenly distributed throughout the feed (1 per 3 media posts)
3. Users always see a mix of content types
