
# Dedicated Post Page Implementation

## Overview
Create a new dedicated post viewing page at `/app/post/:postId` for viewing shared content (videos, images, text posts). This page enables content sharing via direct URLs and provides a focused viewing experience.

## Visual Layout

### Mobile Layout (Based on Screenshot)
```text
┌─────────────────────────────────┐
│ ← Back           [Share] [More] │  Header
├─────────────────────────────────┤
│                                 │
│     [Full-width Video/Image]    │  Media
│                                 │
├─────────────────────────────────┤
│ @username • verified ✓          │  Creator
│ Title of the post               │
│ Description text here...        │
├─────────────────────────────────┤
│ 👍 12K  👎 200  💬 45  ↗️  🔖  ℹ️ │  Actions
├─────────────────────────────────┤
│ 1.2K views • 2 hours ago        │  Stats
├─────────────────────────────────┤
│                                 │
│     [Comments Section]          │  Comments
│                                 │
└─────────────────────────────────┘
```

### Desktop Layout
Same vertical layout but constrained to the main content area between the sidebars (max-width ~650px), maintaining the app's consistent layout.

## Technical Approach

### 1. New Route Registration
Add route `/app/post/:postId` to `App.tsx` within the AppLayout nested routes.

### 2. New Page Component: `PostPage.tsx`
Located at `src/pages/app/PostPage.tsx`

**Data Fetching:**
- Use `getNFTInfo(postId)` from the DeHub API
- React Query for caching (5-minute stale time)
- Loading skeleton while fetching

**Content Type Detection:**
- Check `nftInfo.postType` to determine video/image/text
- Video: Full video player with controls
- Image: Swipeable carousel for multi-image posts
- Text: Formatted text content

**Components to Reuse:**
- `CardHeader` - for creator info display
- `ActionBar` - for like/dislike/comment/share/bookmark/info
- `CommentsSection` - inline comments below content
- `TranslatableText` - for content translation
- Media URL utilities from `src/lib/media-url.ts`

### 3. Component Structure

```text
PostPage
├── Header (sticky)
│   ├── Back button (navigate(-1))
│   ├── Share button
│   └── More options (drawer)
├── Media Section
│   ├── VideoPlayer (if video)
│   ├── ImageCarousel (if image)
│   └── TextContent (if text post)
├── Creator Info
│   ├── Avatar
│   ├── Username + verified badge
│   └── Follow button (future)
├── Content
│   ├── Title
│   └── Description (expandable)
├── ActionBar
├── Stats Row (views, timestamp)
└── CommentsSection (always visible)
```

### 4. Video Player Implementation
- Use the existing video player logic from VideoCard
- Full-width aspect-video container
- Mute/unmute, fullscreen, seek controls
- View tracking integration

### 5. Image Viewer Implementation
- Reuse `ImageCarousel` from ImageCard
- Support multi-image posts with dot indicators
- Tap to open `FullscreenImageViewer`

### 6. Error States
- Post not found (404-style message)
- Network error (retry option)
- Loading skeleton

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/app/PostPage.tsx` | Create | New dedicated post viewing page |
| `src/App.tsx` | Modify | Add route for `/app/post/:postId` |

## Implementation Details

### PostPage.tsx Key Features
1. **Responsive container**: Full width on mobile, centered with max-width on desktop
2. **Sticky header**: Back button stays visible while scrolling
3. **Media sizing**: Videos maintain aspect-video (16:9), images use aspect-square
4. **Comments always visible**: No toggle needed, comments show below content
5. **Proper view tracking**: Record view when threshold met

### Route Priority
Must be added BEFORE the `:postId/info` route to ensure proper matching:
```tsx
<Route path="post/:postId" element={<PostPage />} />
<Route path="post/:postId/info" element={<PostInfoPage />} />
```

## Edge Cases Handled
- Invalid post ID → Show "Post not found" with back button
- Video codec errors → Show "Format not supported" message
- Missing media URLs → Show placeholder
- Very long descriptions → Expandable with "Show more"
