

# Performance Fix: Stories Thumbnails + Sidebar Tab Order

## Problem

Two features are causing heavy network load on initial page load:

1. **Stories bar**: For each of the 15 template stories (which have no `thumbnail_url`), the `VideoThumbnail` component creates a hidden `<video>` element, downloads video data, seeks to frame 0.1s, and draws it to a canvas. That is **15 concurrent video downloads** firing immediately on mount -- extremely expensive in bandwidth and CPU.

2. **Who to Follow sidebar panel**: This is the default tab, and on mount it fires `searchNFTs` API calls (2 pages of 100 items each) plus a followings list query. The Leaderboard tab, by contrast, uses a server-side cache that refreshes every 6 hours and is much lighter.

## Solution

### 1. Stories: Use avatar as thumbnail, load video only on click

Instead of downloading videos to extract thumbnails, display the story creator's **avatar image** as the story thumbnail in the bar. The video will only load when the user taps a story to open the `StoryViewerModal`.

**Files to change:**

- **`src/components/app/cards/StoriesBar.tsx`**
  - Remove the `VideoThumbnail` component import and usage entirely
  - For stories without a `thumbnail_url`, show the avatar (which is already available as a local asset for template stories)
  - Remove the entire `thumbnailsReady` / `handleThumbnailReady` / `loadedCountRef` / `totalStoriesRef` coordination logic -- this was only needed to wait for video frame extraction
  - Remove the skeleton overlay that waited for thumbnails to be ready
  - Remove the `invisible` class toggle on the carousel
  - The result: stories render instantly with avatar images, zero video downloads

- **`src/components/app/stories/VideoThumbnail.tsx`**
  - No changes needed (it may still be used elsewhere), but it will no longer be imported by StoriesBar

### 2. Sidebar: Default to Leaderboard tab, lazy-load Who to Follow

**File to change:**

- **`src/components/app/sidebar/TabbedSidePanel.tsx`**
  - Change default tab from `'follow'` to `'leaderboard'`
  - Reorder the tabs array so Leaderboard (Trophy icon) comes first, then Follow (SquareUserRound), then Chat (MessagesSquare)
  - The `WhoToFollow` component will only mount and fetch data when the user clicks its tab -- no wasted API calls on initial load

## Impact

- **Stories**: Eliminates 15 concurrent video downloads on page load. Avatar images are already bundled as local assets (imported in `use-stories.ts`), so they load instantly with zero network cost.
- **Sidebar**: Defers 2+ API calls (`searchNFTs` pages + followings list) until the user explicitly requests them. The leaderboard data is pre-cached server-side and loads quickly.
- Combined, this should noticeably improve initial load time and reduce bandwidth consumption.

## Technical Details

### StoriesBar changes (simplified render logic)

The story item rendering will be simplified from:

```text
if thumbnail_url exists -> show <img>
else -> show <VideoThumbnail> (downloads video, extracts frame)
```

To:

```text
if thumbnail_url exists -> show <img>
else -> show <Avatar> with the story creator's avatar
```

### TabbedSidePanel changes

```text
Before: tabs = [follow, leaderboard, chat], default = 'follow'
After:  tabs = [leaderboard, follow, chat], default = 'leaderboard'
```

