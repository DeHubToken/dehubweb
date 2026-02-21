

# Merge Comments/Replies into the Posts Tab

## What Changes

The "Posts" tab (MessageSquare icon, second tab) will show both text posts AND the user's comments/replies, merged together chronologically. No new tab is created.

## Files to Modify

### 1. `src/components/app/profile/ProfileTabContent.tsx`

- In the `case 'posts'` branch, fetch comments using the existing `useInfiniteQuery` for `getUserComments` (move it from the `replies` case so it runs when `activeTab === 'posts'`)
- Merge `PROFILE_POSTS` and `allComments` into a single chronologically sorted list
- Render `PostCard` for text posts and `CommentCard` for comments, interleaved by date
- Remove the `case 'replies'` branch entirely (it becomes unused)
- Update the empty state to say "No posts, comments, or replies yet"
- Keep the "Load more" button for paginated comments at the bottom

### 2. `src/hooks/use-profile-page.ts`

- Update the "Posts" tab count to include comments count (fetch a lightweight comment count query)
- Import `getUserComments` and add a `useQuery` with `limit=1` just to get the total count
- Update tab count: `count: PROFILE_POSTS.length + commentCount`
- Export `commentCount` so it's available

### 3. `src/components/app/profile/ProfileConstants.ts`

- Remove `'replies'` from the `TabValue` type if it exists (since we're not using a separate tab)

## Technical Details

- The merged list will sort text posts (using `createdAt`) and comments (using `createdAt`) together in descending chronological order
- Comments render using the existing `CommentCard` component already defined in the file
- The `useInfiniteQuery` for comments will be enabled when `activeTab === 'posts'` instead of `'replies'`
- The tab label stays "Posts" and the icon stays `MessageSquare`
