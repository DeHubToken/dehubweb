
## Root Cause: Missing `comment_like` Notification Type

The API is returning notifications with `type: "comment_like"` (someone liked your comment), but this type is not defined anywhere in the codebase. The `getNotificationContent` switch statement has no case for it, so it falls through to `default: return 'New notification'`.

The actual API payload for yowtf's notification:
```
type: "comment_like"
content: "SilentHawk#BA28, dehu_b and would liked your comment"  ← pre-built by API, ignored
aggregatedCount: 3
latestActorNames: ["SilentHawk#BA28", "dehu_b", "would"]
commentPreview: "lmaoo wtf this rocks"
```

The app builds its own display text but has no case for `comment_like`, so it shows "New notification".

---

## Two-Part Fix

### Part 1 — `src/lib/api/dehub/notifications.ts`

Add `comment_like` to the `NotificationType` union:

```typescript
export type NotificationType = 
  | 'like' 
  | 'comment' 
  | 'comment_reply'
  | 'comment_like'     // ← ADD THIS
  | 'following'
  | 'tip' 
  | 'subscription'
  | 'ppv_purchase'
  | 'video_milestone'
  | 'livestream_start'
  | 'video_removal';
```

### Part 2 — `src/pages/app/NotificationsPage.tsx`

**a) Add icon for `comment_like`** in `getNotificationIcon`:
```typescript
case 'comment_like':
  return <Heart className="w-4 h-4 text-pink-400" />;
```

**b) Add display text for `comment_like`** in `getNotificationContent`:

For the aggregated case (3 people liked your comment), use `latestActorNames`:
```typescript
case 'comment_like': {
  const commentPreview = (notification as any).commentPreview;
  const count = (notification as any).aggregatedCount || 1;
  const names = (notification as any).latestActorNames as string[] | undefined;
  
  if (count > 1 && names && names.length > 0) {
    const first = names[0];
    const rest = count - 1;
    const othersText = rest === 1 ? '1 other' : `${rest} others`;
    return commentPreview
      ? `${first} and ${othersText} liked your comment: "${commentPreview}"`
      : `${first} and ${othersText} liked your comment`;
  }
  
  return commentPreview
    ? `${actorName} liked your comment: "${commentPreview}"`
    : `${actorName} liked your comment`;
}
```

**c) API content fallback** — change the `default` case from `'New notification'` to use the API-provided `content` string if present, so future unknown types don't silently break:
```typescript
default:
  return (notification as any).content || 'New notification';
```

**d) Add `comment_like` to the "Likes" tab filter** so it shows up when filtering by Likes:
```typescript
likes: ['like', 'comment_like'],
```

**e) Navigation for `comment_like`** — add to `getNavigationLink` so clicking the notification goes to the post:
```typescript
case 'comment_like':
  return notification.tokenId ? `/app/post/${notification.tokenId}` : null;
```

---

## Files to Change

- `src/lib/api/dehub/notifications.ts` — add `comment_like` to `NotificationType`
- `src/pages/app/NotificationsPage.tsx` — handle `comment_like` in icon, content, navigation, and tab filter; add API content fallback to default case
