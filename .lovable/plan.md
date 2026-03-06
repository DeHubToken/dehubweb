

# Stop Redundant Avatar API Calls Across the Entire App

## Problem

`useProfileAvatar` (in `use-profile-avatar-cache.ts`) calls `getAccountInfo` for **every wallet address** it receives. This hook is used in:

1. **CardHeader.tsx** — every single feed card (posts, videos, images, live streams, shorts)
2. **QuotedPostEmbed.tsx** — embedded quoted posts
3. **GovernancePage.tsx** / **GovernanceProposalPage.tsx** — proposal authors
4. **FeaturesPage.tsx** — feature request authors

The feed API already provides avatar URLs in its response. The governance/features tables also store `author_avatar`. These redundant re-fetches cause 429 errors from the DeHub API, breaking **all** avatars site-wide.

## Fix

### 1. CardHeader.tsx — Use the feed-provided avatar directly
- Remove `useProfileAvatar` import and call
- Use `avatarSeed` directly (it's already a resolved URL from the feed mapper)
- Keep `getAgentAvatarFallback` as the fallback for AI agent accounts

### 2. QuotedPostEmbed.tsx — Same pattern
- Remove `useProfileAvatar`, use the already-resolved `avatarUrl` from `getMediaUrl`

### 3. GovernancePage.tsx & GovernanceProposalPage.tsx
- Remove `useProfileAvatar`, use `storedAvatarUrl` from `buildAvatarUrl(address, proposal.author_avatar)` directly

### 4. FeaturesPage.tsx
- Remove `useProfileAvatar`, use `storedAvatarUrl` from `buildAvatarUrl(address, feature.author_avatar)` directly

### 5. Leaderboard (already discussed)
- Remove `useLeaderboardAvatars` hook usage, use cached `entry.avatarUrl`

### 6. Keep `useProfileAvatar` for legitimate uses only
- Profile page (`use-dehub-profile.ts`) — fetching a single user's profile is fine
- Settings page — fetching own profile is fine
- Don't delete the hook, just stop using it in bulk/list contexts

## Impact
- Eliminates 50-100+ redundant API calls per page load
- Fixes all avatar display across feed, leaderboard, governance, and features
- No visual changes — same avatars, just sourced from already-available data

## Files Changed
- `src/components/app/cards/CardHeader.tsx`
- `src/components/app/cards/QuotedPostEmbed.tsx`
- `src/pages/app/GovernancePage.tsx`
- `src/pages/app/GovernanceProposalPage.tsx`
- `src/pages/app/FeaturesPage.tsx`
- `src/pages/app/LeaderboardPage.tsx`
- `src/components/app/sidebar/SidebarLeaderboard.tsx`

