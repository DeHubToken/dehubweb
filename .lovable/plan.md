

# Mutual Followers ("Followed by...") Feature

## Overview
Add a "Followed by @user1, @user2, and N others" line on profile pages, computed entirely client-side using the existing `getFollowList` endpoint -- no new DeHub API needed.

## How It Works

1. Fetch the **current logged-in user's following list** (people you follow)
2. Fetch the **visited profile's followers list** (people who follow them)
3. Compute the **intersection** -- these are mutuals ("people you follow who also follow this person")
4. Display up to 3 avatars + names, with an "and N others" suffix

## Caveats / Considerations

- For users with large follow lists (1000+), pagination means we may not catch all mutuals. We can fetch a reasonable amount (e.g. first 200-500 from each list) as a best-effort approach -- this matches how Instagram/X handle it.
- This only shows on **other users' profiles** (not your own), and only when you're logged in.
- Results are cached per session via React Query to avoid redundant API calls.

## Technical Details

### New Hook: `src/hooks/use-mutual-followers.ts`
- Accepts the visited profile's wallet address
- Uses `getFollowList(myAddress, 'following')` and `getFollowList(profileAddress, 'followers')` in parallel
- Computes intersection by matching lowercase addresses
- Enriches results with username/avatar data (already returned by `getFollowList`)
- Returns `{ mutuals: FollowListItem[], isLoading: boolean }`
- Skipped when viewing own profile or when not authenticated

### New Component: `src/components/app/profile/MutualFollowers.tsx`
- Displays stacked avatar circles (overlapping, like Instagram)
- Text: "Followed by **@handle1**, **@handle2**, and **N others**"
- Clicking opens the followers drawer filtered to mutuals (or navigates to the mutual's profile)
- Grey/muted text styling to match the existing profile metadata area

### Integration: `src/pages/app/ProfilePage.tsx`
- Place the `MutualFollowers` component below the bio section, above the tab bar
- Only render when visiting someone else's profile and mutuals exist
