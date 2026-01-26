
# Add PPV, W2E, and Locked Filters to Home and Video Tabs

## Overview
Add content type filters (PPV, Bounty/W2E, Locked) to the Home and Video feeds, allowing users to filter for premium pay-per-view content, watch-to-earn bounty content, and subscriber-only locked content.

## Current State
- The ExplorePage already has PPV and Bounty filter pills (UI only, not connected to API)
- The DeHub API returns `is_ppv`, `ppv_price`, and `is_live` fields on NFT objects
- HomeFeed and VideosFeed have Sort and Upload Date filters, but no content type filters
- The `SearchNFTsParams` interface doesn't include PPV/W2E filter parameters

## Implementation Plan

### 1. Extend feed-utils.ts with Content Type Filter Options
Add new filter constants for content types:
- **PPV** - Pay-per-view premium content
- **Bounty** - Watch-to-earn content with rewards  
- **Locked** - Subscriber-only content

### 2. Update SearchNFTsParams Interface
Extend the API interface to support content type filtering:
- `isPPV` - Filter for pay-per-view content
- `isW2E` - Filter for watch-to-earn content
- `isLocked` - Filter for subscriber-only content

### 3. Update searchNFTs Function
Pass the new filter parameters to the API call.

### 4. Add Client-Side Filtering
Since the API may not fully support these filters server-side, implement client-side filtering as a fallback:
- Filter NFTs where `is_ppv === true` for PPV
- Filter NFTs where W2E fields exist (if available in response)
- Filter NFTs where content is marked as locked/subscriber-only

### 5. Update HomeFeed Component
- Add content type filter state (ppv, w2e, locked toggles)
- Add filter UI section with toggle pills
- Pass filter params to API hook
- Apply client-side filtering to results

### 6. Update VideosFeed Component
- Add same content type filter state
- Add filter UI pills in the existing filter section
- Pass filter params to API hook
- Apply client-side filtering

### 7. Update useDeHubFeed Hook
Accept new filter parameters and pass to the API.

---

## Technical Details

### File Changes

**src/lib/feed-utils.ts**
```typescript
// Add content type filter options
export const CONTENT_TYPE_FILTERS = [
  { label: 'PPV', value: 'ppv' as const, description: 'Pay-per-view' },
  { label: 'Bounty', value: 'w2e' as const, description: 'Watch to earn' },
  { label: 'Locked', value: 'locked' as const, description: 'Subscribers only' },
] as const;

export type ContentTypeFilter = typeof CONTENT_TYPE_FILTERS[number]['value'];

// Client-side filter function
export function filterByContentType<T extends DeHubNFT>(
  items: T[], 
  filters: { ppv?: boolean; w2e?: boolean; locked?: boolean }
): T[] {
  return items.filter(nft => {
    if (filters.ppv && !nft.is_ppv) return false;
    // W2E and locked filtering based on available fields
    return true;
  });
}
```

**src/lib/api/dehub.ts**
```typescript
export interface SearchNFTsParams {
  // ... existing params
  isPPV?: boolean;
  isW2E?: boolean;
  isLocked?: boolean;
}
```

**src/components/app/feeds/HomeFeed.tsx**
- Add state: `contentFilters: { ppv: boolean, w2e: boolean, locked: boolean }`
- Add UI: Toggle pills for PPV, Bounty, Locked in filter section
- Apply filtering before rendering

**src/components/app/feeds/VideosFeed.tsx**
- Same changes as HomeFeed
- Add pills in the existing filter section alongside Sort/Duration/Upload Date

### UI Design
Filter pills will match the existing button style:
- Inactive: `bg-zinc-800 text-zinc-300`
- Active: `bg-white text-black`
- Grouped under "Content Type" label

### Filter Behavior
- Filters are additive (OR logic) - if PPV and Bounty are both on, show either
- When no content type filters are active, show all content
- Filters persist during session but reset on page reload
