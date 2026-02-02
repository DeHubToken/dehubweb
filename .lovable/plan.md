
# Single Post/Video Page Implementation Plan

## Overview
Create dedicated pages for viewing individual posts, videos, and images with the full app layout (sidebars on both sides, header navigation). This enables shareable links like `/app/post/2687` that load as standalone content pages similar to how Twitter/X displays individual tweets.

---

## Current State
- **PostPage.tsx**: Currently redirects `/app/post/:postId` to `/app?post=postId` which pins the post at the top of the home feed
- **PostInfoPage.tsx**: Shows NFT/blockchain metadata for a post (transaction hash, token ID, etc.)
- **No dedicated single-post view page** exists that shows just the content with the full layout

---

## Proposed Solution

### 1. Create New Route Structure

| Route | Component | Content Type |
|-------|-----------|--------------|
| `/app/post/:postId` | `SinglePostPage.tsx` | Text posts, Images, Videos (auto-detected) |
| `/app/video/:tokenId` | Alias to SinglePostPage | Direct video links |

The page will:
- Fetch the post data using `getNFTInfo(tokenId)`
- Auto-detect content type (video, image, text) based on `postType` field
- Render the appropriate card component (VideoCard, ImageCard, PostCard)
- Display within the existing AppLayout (sidebars + header preserved)

---

### 2. Page Layout (Twitter-Style)

```
+------------------+------------------------+------------------+
|                  |  <- Back    Post       |                  |
|   Left Sidebar   +------------------------+  Right Sidebar   |
|   (AppSidebar)   |                        |  (Search, etc)   |
|                  |   [Post Card Content]  |                  |
|                  |                        |                  |
|                  |   Comments Section     |                  |
|                  |   (Always visible)     |                  |
+------------------+------------------------+------------------+
```

Key differences from feed view:
- Single post centered in main content area
- Comments section always expanded below the post
- PageHeader with back button and "Post" title
- Reply input at the bottom

---

### 3. Files to Create/Modify

#### New Files:
1. **`src/pages/app/SinglePostPage.tsx`** - Main single post view page
   - Fetches post data via `getNFTInfo`
   - Detects content type and renders appropriate card
   - Shows comments section inline
   - Reply composer at bottom

#### Modified Files:
1. **`src/App.tsx`** - Update routing
   - Change `/app/post/:postId` to use `SinglePostPage` instead of redirect
   - Add `/app/video/:tokenId` route alias

2. **`src/pages/app/PostPage.tsx`** - Remove (replaced by SinglePostPage)

---

### 4. Component Structure

```
SinglePostPage
├── PageHeader (Back button + "Post" title)
├── Loading State (centered spinner)
├── Error State (not found message)
└── Content Area
    ├── Post Card (VideoCard | ImageCard | PostCard)
    │   └── Based on postType from API response
    └── CommentsSection (always visible, not drawer)
        ├── Comments list
        └── Reply input
```

---

## Technical Details

### Data Fetching
```typescript
// Use existing getNFTInfo function
const { data: post, isLoading, error } = useQuery({
  queryKey: ['single-post', postId],
  queryFn: () => getNFTInfo(postId!),
  enabled: !!postId,
  staleTime: 5 * 60 * 1000,
});
```

### Content Type Detection
```typescript
// Determine card type based on API response
const getContentType = (post: DeHubNFT) => {
  if (post.postType === 'video' || post.videoUrl) return 'video';
  if (post.postType === 'image' || (post.imageUrls?.length && !post.videoUrl)) return 'image';
  return 'post'; // Text post
};
```

### Card Rendering
The page will use the existing card components directly:
- `VideoCard` for videos (with full video player)
- `ImageCard` for image posts (with carousel if multiple images)
- `PostCard` for text-only posts

These cards are already styled correctly and include all functionality (likes, comments, AI chat, etc.).

---

## Mobile Considerations

- On mobile (< 1024px), the sidebars are already hidden by AppLayout
- PageHeader will show the back button prominently
- Comments section remains inline (not drawer) for single post view to match Twitter behavior
- Bottom nav remains visible for navigation

---

## Route Configuration

```typescript
// In App.tsx
<Route path="app" element={<AppLayout />}>
  {/* ... existing routes ... */}
  <Route path="post/:postId" element={<SinglePostPage />} />
  <Route path="video/:tokenId" element={<SinglePostPage />} />
  <Route path="post/:postId/info" element={<PostInfoPage />} />
</Route>
```

---

## Edge Cases Handled

1. **Optimistic posts** (still minting): Show processing state like PostInfoPage does
2. **Invalid post ID**: Show error state with back button
3. **Private/hidden posts**: Respect visibility settings from API
4. **Deep linking**: Full URL like `dehub.io/app/post/2687` works directly

---

## Summary of Changes

| Action | File | Description |
|--------|------|-------------|
| Create | `src/pages/app/SinglePostPage.tsx` | New single post view page |
| Modify | `src/App.tsx` | Update routes to use new page |
| Delete | `src/pages/app/PostPage.tsx` | Remove redirect logic (now handled by SinglePostPage) |

This implementation reuses all existing card components and styling, ensuring the single post page matches the exact look and feel of posts in the feed while providing a dedicated shareable URL.
