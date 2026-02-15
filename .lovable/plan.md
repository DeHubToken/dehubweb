
## Fix User Blocking and Follow Recommendations

### Issues Found

1. **Block button is a placeholder**: The "Block" button in `ProfileOptionsDrawer.tsx` and all feed cards (`PostCard`, `VideoCard`, `ImageCard`, `LiveCard`, `LiveStreamCard`) only shows a toast message -- no API call, no persistence.

2. **Followed users appearing in recommendations**: The `MobileWhoToFollowCarousel` reads `currentUserData?.followings` while the desktop `WhoToFollow` reads `currentUserData?.followingsList` -- these may return different data shapes, and the 5-minute stale cache means newly followed users persist in suggestions.

3. **No blocked users section in settings**: There is no UI to view or manage blocked users.

---

### Solution

Since the DeHub API has no dedicated "block user" endpoint at the profile level (only DM-level blocking exists), we will build a local blocking system using the database.

#### Part 1: Database -- `blocked_users` table

Create a new table to store blocked users per wallet address:

```sql
CREATE TABLE public.blocked_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_address TEXT NOT NULL,
  blocked_address TEXT NOT NULL,
  blocked_username TEXT,
  blocked_display_name TEXT,
  blocked_avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(blocker_address, blocked_address)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own blocks"
  ON public.blocked_users FOR SELECT
  USING (blocker_address = current_setting('request.headers')::json->>'x-wallet-address');

CREATE POLICY "Users can insert own blocks"
  ON public.blocked_users FOR INSERT
  WITH CHECK (blocker_address = current_setting('request.headers')::json->>'x-wallet-address');

CREATE POLICY "Users can delete own blocks"
  ON public.blocked_users FOR DELETE
  USING (blocker_address = current_setting('request.headers')::json->>'x-wallet-address');
```

**Note:** Since authentication uses external wallet-based auth (not Supabase Auth), RLS will use a custom header or we'll query via an edge function for secure access.

#### Part 2: Edge Function -- `manage-blocked-users`

A simple edge function to handle CRUD for blocked users, authenticated via the wallet address from localStorage:

- `GET /manage-blocked-users` -- list blocked users for the caller
- `POST /manage-blocked-users` -- block a user (body: `{ blockedAddress, username?, displayName?, avatarUrl? }`)
- `DELETE /manage-blocked-users?address=0x...` -- unblock a user

#### Part 3: React Hook -- `useBlockedUsers`

New hook (`src/hooks/use-blocked-users.ts`) providing:
- `blockedUsers` -- list of blocked addresses
- `blockedSet` -- Set for O(1) lookups
- `blockUser(address, metadata)` -- block + optimistic update
- `unblockUser(address)` -- unblock + optimistic update
- `isBlocked(address)` -- quick check

#### Part 4: Wire Up the Block Button

**`ProfileOptionsDrawer.tsx`**: Replace the placeholder toast with actual `blockUser()` call, passing the profile's address and metadata.

**Feed cards** (`PostCard.tsx`, `VideoCard.tsx`, `ImageCard.tsx`, `LiveCard.tsx`, `LiveStreamCard.tsx`): Wire the "Block Creator" button to call `blockUser()` with the creator's address.

#### Part 5: Filter Blocked Users from Feeds and Recommendations

**`WhoToFollow.tsx` and `MobileWhoToFollowCarousel.tsx`**: Add `blockedSet` to the filter logic so blocked users never appear in suggestions.

**Feed hooks** (`use-unified-feed.ts`, `use-dehub-feed.ts`): Add blocked user filtering alongside the existing `BLOCKED_CREATORS` check.

#### Part 6: Fix Followed Users in Recommendations

**`MobileWhoToFollowCarousel.tsx`**: Change `currentUserData?.followings` to also check `currentUserData?.followingsList` (matching the desktop version), ensuring consistent filtering regardless of which API field is populated.

#### Part 7: Blocked Users Section in Settings

Add a "Blocked Users" section inside `PrivacySettings` in `SettingsPage.tsx`:
- Shows list of blocked users with avatar, name, and "Unblock" button
- Empty state: "You haven't blocked anyone"
- Uses the `useBlockedUsers` hook

---

### Files to Create
- `supabase/functions/manage-blocked-users/index.ts` -- edge function
- `src/hooks/use-blocked-users.ts` -- React hook

### Files to Modify
- `src/components/app/profile/ProfileOptionsDrawer.tsx` -- wire block button
- `src/components/app/cards/PostCard.tsx` -- wire block button
- `src/components/app/cards/VideoCard.tsx` -- wire block button
- `src/components/app/cards/ImageCard.tsx` -- wire block button
- `src/components/app/cards/LiveCard.tsx` -- wire block button
- `src/components/app/cards/LiveStreamCard.tsx` -- wire block button
- `src/components/app/WhoToFollow.tsx` -- filter blocked users
- `src/components/app/mobile/MobileWhoToFollowCarousel.tsx` -- filter blocked users + fix followings field
- `src/hooks/use-unified-feed.ts` -- filter blocked users from feeds
- `src/hooks/use-dehub-feed.ts` -- filter blocked users from feeds
- `src/pages/app/SettingsPage.tsx` -- add Blocked Users section
