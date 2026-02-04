
# Add Video Post Descriptions

## Problem
Video posts are not showing their descriptions because:
1. The `VideoItem` type is missing a `description` field
2. The feed mapper and single post page transformers don't include descriptions
3. The `VideoCard` component only displays the title, not the description

## Solution Overview
Add description support throughout the video content pipeline - from type definitions, through data mappers, to the UI component.

---

## Changes

### 1. Add `description` to VideoItem Type
**File:** `src/types/feed.types.ts`

Add an optional `description` field to the `VideoItem` interface, similar to how `ImagePost` already has one.

```typescript
export interface VideoItem extends BaseFeedItem {
  // ... existing fields ...
  title: string;
  description?: string;  // NEW: Video description/body text
  // ... rest of fields ...
}
```

### 2. Map Description in Unified Feed
**File:** `src/hooks/use-unified-feed.ts`

Update `mapToVideoItem` to include the description from the API response:

```typescript
return {
  // ... existing fields ...
  title: item.name || 'Untitled',
  description: item.description,  // NEW
  // ... rest of fields ...
};
```

### 3. Map Description in SinglePostPage
**File:** `src/pages/app/SinglePostPage.tsx`

Update `toVideoItem` to include description (similar to how `toImagePost` handles it):

```typescript
function toVideoItem(nft: DeHubNFT): VideoItem {
  const title = nft.title || nft.name || '';
  const description = nft.description && nft.description !== title 
    ? nft.description 
    : undefined;
  
  return {
    // ... existing fields ...
    title,
    description,  // NEW
    // ... rest of fields ...
  };
}
```

### 4. Display Description in VideoCard
**File:** `src/components/app/cards/VideoCard.tsx`

Render the description below the title using the existing `TranslatableText` component for consistency:

```tsx
{/* Info & Actions */}
<div className="p-3">
  <TranslatableText text={video.title} className="text-white text-sm font-medium mb-1" as="h3" />
  {video.description && video.description !== video.title && (
    <TranslatableText 
      text={video.description} 
      className="text-zinc-400 text-sm mb-2 line-clamp-2" 
      as="p" 
    />
  )}
  <div className="mb-3">
    <PostMetadata ... />
  </div>
  <ActionBar ... />
</div>
```

### 5. Update Post Cache Utility
**File:** `src/lib/post-cache.ts`

Update `videoItemToNFT` to properly preserve the description for cache pre-population:

```typescript
function videoItemToNFT(video: VideoItem): Partial<DeHubNFT> {
  return {
    // ... existing fields ...
    description: video.description || video.title,  // Use actual description
    // ... rest of fields ...
  };
}
```

---

## Technical Notes
- The description is rendered with `line-clamp-2` to limit it to 2 lines in the feed, preventing overly long descriptions from dominating the card
- A duplicate check (`description !== title`) prevents showing the same text twice when the API returns the title as description
- Uses `TranslatableText` wrapper for consistency with other translatable content in the app
