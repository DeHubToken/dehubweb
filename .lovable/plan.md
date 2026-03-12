

# Show all liked posts when clicking a same-actor bundled notification

## Problem
When clicking "kwame1 liked 2 of your posts", the app navigates to only one post (`bundle.primary.tokenId`). The other post's `tokenId` is lost because `handleClick` calls `getNavigationLink(notification)` using only the primary notification.

## Solution
When a same-actor bundle with multiple posts is clicked, open a **drawer** listing all the posts in the bundle (with thumbnails and titles). Each row links to that post. This is consistent with how multi-actor aggregates already open a drawer listing actors.

## Changes

### 1. Extend `BundledNotification` interface
Add an `allNotifications: DeHubNotification[]` field so the bundle carries all raw notifications (not just IDs). This gives access to each `tokenId`, `tokenTitle`, and `tokenThumbnail`.

### 2. Update `bundleNotifications()` function
When building same-actor bundles, store the full `group` array in `allNotifications`.

### 3. Update `NotificationItem` click handler
In `handleClick`, if `bundle.bundleType === 'same-actor' && bundle.postCount > 1`, open a new "posts drawer" instead of navigating. This drawer lists each post with:
- Thumbnail (if available)
- Title or fallback text
- Clickable row navigating to `/app/post/{tokenId}`

### 4. Add posts drawer UI
Add a `Drawer` (matching the existing actors drawer pattern) with state `showPostsDrawer`. Each row shows the post thumbnail + title and navigates on click.

### File: `src/pages/app/NotificationsPage.tsx`
All changes are in this single file.

