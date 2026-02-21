

# Fix Profile Posts Tab: Count and Comment UI

## Issues

1. **Tab count shows 1 instead of 2**: The `getUserComments` API call uses `requiresAuth: true`, and the `totalCount` field from the API response may not be returned reliably. The lightweight count query (limit=1) may also not trigger a proper `totalCount` response. Fix: use the actual fetched comment data length as a fallback, and also fetch with a higher limit for accurate counting.

2. **Comment UI looks different from text posts**: The `CommentCard` is a simple custom component with a small 8x8 avatar and minimal layout, while `PostCard` uses the full card design with `CardHeader`, `ActionBar`, `PostMetadata`, etc. Comments should be styled to match the `PostCard` look.

## Changes

### 1. `src/components/app/profile/ProfileTabContent.tsx` - Restyle CommentCard

Redesign the `CommentCard` component to visually match `PostCard`:
- Use the same outer wrapper styling (rounded-xl border, p-3)
- Use `CardHeader`-style layout: larger avatar, username, timestamp in the same format
- Show comment content in the same text style as PostCard
- Add a subtle "Replied to a post" or "Comment" label to differentiate
- Keep the "View post" link
- Match the spacing, font sizes, and overall visual weight of PostCard

### 2. `src/hooks/use-profile-page.ts` - Fix comment count

The current count query fetches with `limit=1` which may not return `totalCount` properly. Two fixes:
- Change the count query to not require auth (or handle the case where auth isn't ready)
- Use the actual comments data from `ProfileTabContent` to supplement the count -- but since the count is needed in the hook, instead fetch with a reasonable limit or rely on `totalCount`
- Add a fallback: if `totalCount` is 0 but items exist, use `items.length` as minimum count
- Pass the `commentCount` to `ProfileTabContent` so the tab can also update it when more data loads

### 3. `src/lib/api/dehub/users.ts` - Improve total count extraction

Update `getUserComments` to better extract the total count:
- Check additional fields like `total`, `count`, `totalItems` in case the API uses different naming
- When `totalCount` is missing, fall back to items array length as a minimum

## Technical Details

- The `CommentCard` will be restyled to use the same visual structure as `PostCard` but with comment-specific content (no action bar with vote/share, just view counts and a "view post" link)
- The count fix ensures `totalCount` is properly extracted from whatever the API returns
- Comments and posts will be visually cohesive in the merged feed
