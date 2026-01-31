

# True Random Feed Implementation for All Feeds

## Overview

Implement **true random** content discovery by selecting random post IDs from the entire database (~2600+ posts) instead of just shuffling the newest 100 posts. This will be applied to:

1. **Home Feed** - Already has Random mode, needs upgrade
2. **Videos Feed** - Needs Random sort option added
3. **Images Feed** - Already has Random mode, needs upgrade

## How It Works

```text
Current Approach:
┌─────────────────────────────────────────────────────┐
│  Fetch pages 1-5 (100 posts) → Shuffle them        │
│  Result: Only newest content, shuffled order       │
└─────────────────────────────────────────────────────┘

New Approach:
┌─────────────────────────────────────────────────────┐
│  1. Get totalCount from API (e.g., 2600)           │
│  2. Generate 30 random IDs (1 to 2600)             │
│  3. Fetch each post by ID using getNFTInfo         │
│  4. Filter valid minted posts → Display            │
└─────────────────────────────────────────────────────┘
```

## User Experience

- **Loading**: Shows skeleton while fetching random posts
- **Pull-to-refresh**: Generates fresh random IDs
- **Content variety**: Posts from any time period can appear
- **No more "flickering"**: Single stable render after fetch

---

## Technical Implementation

### Step 1: Create Shared Random Feed Utility

**New file: `src/lib/random-feed.ts`**

Create a reusable utility for fetching truly random posts:

```typescript
import { getNFTInfo, type DeHubNFT } from '@/lib/api/dehub';

const DEHUB_API_BASE = "https://api.dehub.io";
const RANDOM_BATCH_SIZE = 30;

// Get total count from feed API
export async function getFeedTotalCount(postType?: string): Promise<number> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('status', 'minted');
  if (postType) url.searchParams.set('postType', postType);
  
  const response = await fetch(url.toString());
  const data = await response.json();
  return data.pagination?.totalCount || 2600; // Fallback
}

// Fetch random posts by generating random IDs
export async function fetchRandomPosts(
  totalCount: number,
  batchSize: number = RANDOM_BATCH_SIZE,
  postType?: 'video' | 'feed-images' | 'all'
): Promise<DeHubNFT[]> {
  // Generate unique random IDs
  const randomIds = new Set<number>();
  const attempts = batchSize * 2; // Over-generate to account for invalid IDs
  
  for (let i = 0; i < attempts && randomIds.size < batchSize; i++) {
    const id = Math.floor(Math.random() * totalCount) + 1;
    randomIds.add(id);
  }
  
  // Fetch all posts in parallel
  const results = await Promise.allSettled(
    Array.from(randomIds).map(id => getNFTInfo(String(id)))
  );
  
  // Filter successful fetches and valid minted posts
  const posts = results
    .filter((r): r is PromiseFulfilledResult<DeHubNFT> => 
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value)
    .filter(post => {
      if (!post || post.status !== 'minted') return false;
      if (postType === 'video') return post.postType === 'video' || post.videoUrl;
      if (postType === 'feed-images') return post.postType === 'feed-images' || (post.imageUrl && !post.videoUrl);
      return true;
    });
  
  return posts;
}
```

### Step 2: Update HomeFeed.tsx

**File: `src/components/app/feeds/HomeFeed.tsx`**

Replace the 5-page pre-fetch with the new random ID approach:

**Changes:**
1. Import the new utility functions
2. Add state for random posts and loading
3. Create effect to fetch random posts when in random mode
4. Use random posts instead of shuffled paginated data for random mode

```typescript
// New imports
import { getFeedTotalCount, fetchRandomPosts } from '@/lib/random-feed';

// New state (around line 318)
const [randomPosts, setRandomPosts] = useState<DeHubNFT[]>([]);
const [isLoadingRandom, setIsLoadingRandom] = useState(false);
const [randomFetchTrigger, setRandomFetchTrigger] = useState(0);

// Replace pre-fetch effect with random fetch effect
useEffect(() => {
  if (selectedSort.value !== 'random') {
    setHasPreFetched(true);
    return;
  }
  
  let cancelled = false;
  
  async function loadRandomPosts() {
    setIsLoadingRandom(true);
    try {
      const totalCount = await getFeedTotalCount();
      const posts = await fetchRandomPosts(totalCount, 30);
      if (!cancelled) {
        setRandomPosts(posts);
        setHasPreFetched(true);
      }
    } catch (error) {
      console.error('Failed to fetch random posts:', error);
      setHasPreFetched(true);
    } finally {
      if (!cancelled) setIsLoadingRandom(false);
    }
  }
  
  loadRandomPosts();
  return () => { cancelled = true; };
}, [selectedSort.value, randomFetchTrigger]);

// Update pull-to-refresh handler
useEffect(() => {
  if (shuffleKey > 0) {
    setRandomFetchTrigger(prev => prev + 1);
    setHasPreFetched(false);
    if (selectedSort.value !== 'random') refetch();
  }
}, [shuffleKey, refetch, selectedSort.value]);
```

**Update the items mapping** to use random posts when in random mode instead of shuffled paginated data.

### Step 3: Update VideosFeed.tsx

**File: `src/components/app/feeds/VideosFeed.tsx`**

Add the Random sort option and true random fetching:

**Changes:**
1. Add "Random" to the sort options (currently only has Latest, Most Liked, etc.)
2. Add state for random video posts
3. Implement random fetch logic for video content
4. Display random videos when in random mode

```typescript
// New imports
import { getFeedTotalCount, fetchRandomPosts } from '@/lib/random-feed';

// Add state
const [randomVideos, setRandomVideos] = useState<VideoItem[]>([]);
const [isLoadingRandom, setIsLoadingRandom] = useState(false);

// Add effect for random mode
useEffect(() => {
  if (selectedSort.value !== 'random') return;
  
  async function loadRandomVideos() {
    setIsLoadingRandom(true);
    try {
      const totalCount = await getFeedTotalCount('video');
      const posts = await fetchRandomPosts(totalCount, 30, 'video');
      setRandomVideos(posts.map((nft, i) => mapNFTToVideoItem(nft, i)));
    } finally {
      setIsLoadingRandom(false);
    }
  }
  
  loadRandomVideos();
}, [selectedSort.value, refreshKey]);
```

### Step 4: Update ImagesFeed.tsx

**File: `src/components/app/feeds/ImagesFeed.tsx`**

Replace the deterministic shuffle with true random:

**Changes:**
1. Add state for random image posts
2. Implement random fetch logic for image content
3. Display random images when in random mode

```typescript
// New imports  
import { getFeedTotalCount, fetchRandomPosts } from '@/lib/random-feed';
import { mapNFTToImagePost } from '@/hooks/use-dehub-feed';

// Add state
const [randomImages, setRandomImages] = useState<ImagePost[]>([]);
const [isLoadingRandom, setIsLoadingRandom] = useState(false);

// Add effect for random mode
useEffect(() => {
  if (selectedSort.value !== 'random') return;
  
  async function loadRandomImages() {
    setIsLoadingRandom(true);
    try {
      const totalCount = await getFeedTotalCount('feed-images');
      const posts = await fetchRandomPosts(totalCount, 30, 'feed-images');
      setRandomImages(posts.map((nft, i) => mapNFTToImagePost(nft, i)));
    } finally {
      setIsLoadingRandom(false);
    }
  }
  
  loadRandomImages();
}, [selectedSort.value, refreshKey]);
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/random-feed.ts` | Create | Shared utility for random post fetching |
| `src/components/app/feeds/HomeFeed.tsx` | Modify | Use true random instead of pre-fetch shuffle |
| `src/components/app/feeds/VideosFeed.tsx` | Modify | Add Random sort option with true random |
| `src/components/app/feeds/ImagesFeed.tsx` | Modify | Upgrade Random mode to true random |

---

## Benefits

1. **True content discovery** - Any post from history can appear
2. **Better engagement** - High-quality older content resurfaces
3. **Faster perceived loading** - Single fetch cycle, no multiple re-renders
4. **Consistent UX** - Same random behavior across all feeds
5. **Fresh every time** - New random IDs on each refresh

## Trade-offs

- ~30 parallel API calls per random load (vs 1 paginated call)
- Some random IDs may be invalid (deleted/failed posts), reducing actual count
- Slightly higher network usage, but still reasonable

