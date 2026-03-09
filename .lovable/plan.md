

## Notification Optimizations

After reviewing the API responses and rendering logic, here are the actionable improvements:

### 1. Aggregated likes missing "and X others" text
The API returns `aggregatedCount: 10` and `latestActorNames: ["tiff","bill","erwin"]` for the like notification, but `getNotificationContent` only handles `following` type for aggregated counts. The like notification just shows "tiff liked your post" instead of "tiff and 9 others liked your post".

**Fix**: Add aggregated-count handling for `like`, `comment`, `repost`, and `comment_like` types, similar to how `following` already works (line 216-220).

### 2. Strip @mention prefix from comment previews
The `commentPreview` for mentions includes the @tag itself: `"@kwame1 Yes, it is me :)"`. The italic preview below the notification text redundantly shows the @mention.

**Fix**: Strip leading `@username` from `commentPreview` before displaying it in the preview snippet (around line 444-452).

### 3. Show post title as secondary context on reply/mention notifications
Currently reply/mention notifications show the comment text as the preview, but the user loses context about *which post* it was on.

**Fix**: For reply/mention types, show `commentPreview` as the primary preview and add a subtle secondary line like "on: When I am not pitching DeHub" using `tokenTitle`.

### 4. Aggregated like notifications should show stacked actor avatars
When a like has `latestActorNames` with multiple actors, the notification only shows one avatar. Showing 2-3 overlapping mini-avatars (from `latestActorUsers`) would make aggregated notifications more visually distinct.

**Summary of changes**:
- `NotificationsPage.tsx` -- `getNotificationContent()`: add aggregated count logic for like/comment/repost types
- `NotificationsPage.tsx` -- preview snippet section: strip leading @mention from commentPreview, add secondary post-title line for reply/mention
- `NotificationsPage.tsx` -- `NotificationItem`: optionally render stacked avatars for aggregated notifications

