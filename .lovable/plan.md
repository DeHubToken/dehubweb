

# Fix: Followers List Shows "Follow" for Already-Followed Users

## Problem
When viewing a Followers list, users you already follow incorrectly show a "Follow" button instead of "Following". This happens because the `getFollowList` API call does not send authentication, so the backend can't determine the relationship between the current user and each listed user. The `isFollowing` field comes back as `undefined`/`false`.

## Solution
Pass `requiresAuth: true` to the `getFollowList` API call so the backend receives the user's auth token and can return accurate `isFollowing` status for each user in the list.

## Technical Details

### File: `src/lib/api/dehub/social.ts`
- Add `requiresAuth: true` to the `apiCall` options inside `getFollowList`
- This ensures the JWT token is sent, allowing the API to return the correct `isFollowing` field per user

### Change
```text
Before:  apiCall(`/api/follow_list/...`, { params })
After:   apiCall(`/api/follow_list/...`, { params, requiresAuth: true })
```

This is a one-line fix. No other files need to change -- the `FollowersListDrawer` already reads `isFollowing` from the response and renders the button state correctly; it just never received the right data.

