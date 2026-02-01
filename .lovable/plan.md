
# Followers/Following List Feature

## Overview
Add clickable follower/following counts on profile pages that open a drawer showing the full list of users. Each user in the list will be clickable to navigate to their profile.

## Technical Approach

### 1. Preserve Raw Follower/Following Arrays

**File: `src/hooks/use-dehub-profile.ts`**

Update `ProfileData` interface and `mapUserToProfile` to preserve the raw arrays:

```typescript
export interface ProfileData {
  // ... existing fields
  following: number;
  followers: number;
  // NEW: Raw arrays for list display
  followersList?: string[];   // Array of wallet addresses
  followingsList?: string[];  // Array of wallet addresses
}

export function mapUserToProfile(user: DeHubUser): ProfileData {
  // ... existing logic
  
  // Preserve raw arrays if available
  const followersList = Array.isArray(user.followers) ? user.followers : undefined;
  const followingsList = user.followings;
  
  return {
    // ... existing fields
    followersList,
    followingsList,
  };
}
```

### 2. Create FollowersListDrawer Component

**File: `src/components/app/profile/FollowersListDrawer.tsx`** (new)

A reusable drawer component that:
- Accepts a list of wallet addresses and a title ("Followers" or "Following")
- Fetches user details for each address using `getAccountInfo`
- Displays users in a scrollable list with:
  - Avatar, display name, @handle
  - "Follows you" badge (when applicable)
  - Follow/Unfollow button
- Clicking a user navigates to their profile

Key implementation details:
- Use batch fetching (Promise.all with chunking) for performance
- Show loading skeleton while fetching
- Handle empty states gracefully
- Pass current user's address to get `followsYou` status for each user

### 3. Integrate into ProfilePage

**File: `src/pages/app/ProfilePage.tsx`**

- Add state for drawer open/close and which list to show
- Replace the static follower/following buttons with drawer triggers
- Pass the appropriate list to the drawer component

```typescript
// New state
const [listDrawerOpen, setListDrawerOpen] = useState(false);
const [listType, setListType] = useState<'followers' | 'following'>('followers');

// Updated buttons (around line 751-760)
<button 
  onClick={() => {
    setListType('following');
    setListDrawerOpen(true);
  }}
  className="hover:underline"
>
  <span className="font-bold text-white">{profile.following.toLocaleString()}</span>
  <span className="text-zinc-500 ml-1">Following</span>
</button>
```

### 4. Handle API Limitations

If the DeHub API returns only counts (not arrays) for the viewed profile:
- We'll need to check if arrays are available
- Show a toast message like "List not available" if arrays are empty
- Consider adding a dedicated API endpoint request to DeHub team

## UI Design

The drawer will match existing app patterns:
- Glass-style `DrawerContent`
- User rows similar to `WhoToFollow` component
- Infinite scroll if lists are long (optional, phase 2)
- Loading states with skeleton animation

```
+-----------------------------------+
|   Followers (123)            [X] |
+-----------------------------------+
| [Avatar] Display Name            |
|         @handle                  |
|         [Follows you] [Follow]   |
+-----------------------------------+
| [Avatar] Another User            |
|         @username                |
|                      [Following] |
+-----------------------------------+
|           ...more users...       |
+-----------------------------------+
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/use-dehub-profile.ts` | Add `followersList`/`followingsList` to ProfileData |
| `src/components/app/profile/FollowersListDrawer.tsx` | **Create** new component |
| `src/components/app/profile/index.ts` | **Create** barrel export |
| `src/pages/app/ProfilePage.tsx` | Add drawer integration |

## Edge Cases

- **Empty lists**: Show friendly message "No followers yet" / "Not following anyone"
- **Large lists**: Initial load of 20-50 users, with load more button
- **API returns count not array**: Gracefully handle with "List unavailable" state
- **Self-profile**: Still show lists, but hide Follow button on yourself

## Future Enhancements (Phase 2)

- Search/filter within the list
- Mutual followers highlight ("Followed by X, Y, and Z others you follow")
- Infinite scroll for very large lists
