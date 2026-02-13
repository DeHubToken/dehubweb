

# Decompose ProfilePage.tsx (1,336 lines) into Sub-Components and Hooks

## Overview
Split the monolithic ProfilePage into 6 focused files while keeping ProfilePage.tsx as the thin orchestrator. Every function, handler, and UI element is preserved exactly -- just relocated.

## New File Structure

```text
src/pages/app/ProfilePage.tsx                    ~200 lines  (orchestrator - wires everything together)
src/hooks/use-profile-page.ts                    ~180 lines  (all data fetching + state + derived values)
src/hooks/use-profile-follow.ts                  ~100 lines  (follow/unfollow logic + optimistic updates)
src/components/app/profile/ProfileHeader.tsx      ~350 lines  (banner, avatar, stories overlay, info, stats)
src/components/app/profile/ProfileTabContent.tsx  ~280 lines  (renderTabContent switch + all tab cases)
src/components/app/profile/ProfileOptionsDrawer.tsx ~150 lines (share sheet + offer drawer + all option handlers)
src/components/app/profile/ProfileConstants.ts     ~50 lines  (DEFAULT_BANNERS, DISPLAY_WALLET_OVERRIDES, getDefaultBanner, TabValue type)
```

## What Goes Where

### 1. `ProfileConstants.ts` (~50 lines)
- `DISPLAY_WALLET_OVERRIDES` record
- `DEFAULT_BANNERS` array + all 9 banner imports
- `getDefaultBanner()` function
- `TabValue` type export

### 2. `use-profile-page.ts` hook (~180 lines)
Consolidates all data fetching and derived state into a single hook:
- Route params resolution (`lookupUsername`, `lookupUserId`)
- `useDeHubProfile` + `useDeHubUserContent` calls
- `isOwnProfile` / `isViewingOwnProfile` derivation
- Badge balance fetching
- Content separation (`useMemo` for `ALL_CONTENT`, `PROFILE_POSTS`, etc.)
- `PROFILE_TABS` array construction
- Subscription plans fetching (`useCreatorPlans`, `useIsSubscribed`)
- Privacy settings (`useUserPrivacySettings`)
- Stories filtering + `profileStoryStartIndex`
- Optimistic posts
- Pull-to-refresh setup
- Returns a single flat object with all values needed by sub-components

### 3. `use-profile-follow.ts` hook (~100 lines)
Extracted from lines 326-390:
- `handleFollow()` with private account awareness + optimistic update via `setFollowStatus`
- `handleUnfollow()` with optimistic revert
- `isFollowLoading` state
- Takes `profile`, `isAuthenticated`, `isTargetPrivate`, `setFollowStatus`, `handleApiError` as params

### 4. `ProfileHeader.tsx` component (~350 lines)
The banner + avatar + profile info card (lines 908-1220):
- Cover photo with fullscreen click
- Avatar with stories overlay (ShimmerBorder, liquid glass Play/Image buttons)
- Action buttons row (Edit Profile / Follow / Subscribe / Requested / Subscribed + options drawer trigger)
- Profile name, handle, verified badge, staking badge, "Follows you" chip
- Wallet address display
- Bio with TranslatableText + BioTranslateButton
- Joined date
- Followers/Following counts with privacy gating
- MutualFollowers
- Props: receives all needed data from the orchestrator (profile, badges, stories, follow state, handlers)

### 5. `ProfileTabContent.tsx` component (~280 lines)
The `renderTabContent()` switch (lines 505-747):
- Private account gate
- Loading state
- All 8 tab cases (home with optimistic posts, posts, images, videos, subscribers with plan management, songs, live, fractions)
- Props: `activeTab`, content arrays, plan data, profile info, modal openers

### 6. `ProfileOptionsDrawer.tsx` component (~150 lines)
The ShareOptions component + offer drawer (lines 407-503, 1249-1284):
- Copy URL / username / address handlers
- Message, Send coins, Notify, Make Offer buttons
- Unfollow + Block buttons
- Offer drawer with DHB input
- Props: `profile`, `isViewingOwnProfile`, `isFollowing`, handlers

### 7. `ProfilePage.tsx` orchestrator (~200 lines)
Slim file that:
- Calls `useProfilePage()` to get all data
- Calls `useProfileFollow()` for follow actions
- Manages UI-only state (modals open/close, fullscreen image, active tab)
- Renders loading / auth gate / username-available states
- Composes `ProfileHeader`, tab bar, `ProfileTabContent`, `ProfileOptionsDrawer`
- Renders modals (CreatePlanModal, EditPlanModal, FollowersListDrawer, StoryViewerModal, LoginModal, FullscreenImageViewer)

## Safety Guarantees

- **Zero import changes** in any consumer file -- only `App.tsx` imports ProfilePage, and the default export stays
- **All state flows preserved** -- `setFollowStatus` from `useDeHubProfile` is passed through exactly as before
- **Optimistic update chain intact** -- `useProfileFollow` receives `setFollowStatus` from the profile hook and calls it identically
- **Pull-to-refresh handlers** stay wired to the same container ref
- **Story viewer** keeps the same `allStories` array and `profileStoryStartIndex` calculation
- **Tab content** receives the exact same content arrays and renders identical JSX
- **Privacy gating** logic (hideFollowerCounts, showFollowersFollowing, isTargetPrivate) flows through props unchanged
- **Conditional AppLayout wrapper** for `/:username` routes stays in the orchestrator

## Technical Details

### Cross-component state that must be threaded carefully:
1. `setFollowStatus` (from useDeHubProfile) -- used by follow handlers AND optimistically updates `isFollowing`
2. `setActiveTab` -- used by Subscribe button in header (navigates to subs tab) AND by tab bar
3. `setCreatePlanModalOpen` -- triggered from both subscribers tab empty state AND header
4. `shareSheetOpen` / `setShareSheetOpen` -- used by options drawer AND closed by follow handlers
5. `fullscreenImage` -- set by avatar click, cover click, and image overlay; cleared by FullscreenImageViewer

All of these are managed in the orchestrator and passed as props/callbacks.

### Import deduplication:
- Lucide icons are imported only where used (e.g., `Copy`, `Wallet` in ProfileOptionsDrawer, not ProfileHeader)
- `cn`, `toast`, drawer components imported only in files that use them
- 3D icon assets imported only in ProfileTabContent (where empty states render)
