
# Split `dehub.ts` into Domain Modules -- Verified Safe

## Verification Summary

Audited all 67 consumer files. Every import uses `'@/lib/api/dehub'` with named imports. The barrel re-export strategy guarantees zero breaking changes.

**Risks checked and cleared:**
- No default exports exist
- `DEHUB_API_BASE` is not exported (private const); consumers that need it define their own
- `VoteResponse` is duplicated (lines 861 and 3517) but never imported externally -- will consolidate
- `voteOnNFT` is dead code (never imported) -- will remove
- `dpay.ts` imports `getAuthToken` from `'./dehub'` -- resolves correctly to `./dehub/index.ts`
- No existing `src/lib/api/dehub/` directory to conflict with

## New File Structure

```text
src/lib/api/
  dehub.ts              --> replaced with: export * from './dehub/index'
  dehub/
    index.ts            ~50 lines   - Barrel re-export
    core.ts             ~110 lines  - DEHUB_API_BASE, apiCall, auth token helpers, AuthenticationError
    types.ts            ~220 lines  - DeHubUser, DeHubNFT, DeHubCategory, PaginatedResponse, etc.
    auth.ts             ~60 lines   - authenticateWallet, checkUsernameAvailability
    users.ts            ~120 lines  - getAccountInfo, getAccountByUsername, updateProfile, getUsersCount, getUserNFTs
    feed.ts             ~200 lines  - searchNFTs, universalSearch, searchSuggestions, getNFTInfo, recordView, getCategories, getSavedPosts, getLikedPosts, getWatchHistory, recordBatchViews
    social.ts           ~180 lines  - followUser, unfollowUser, isFollowing, getFollowList, toggleFollow, voteOnPost, VoteResponse, FollowResponse, toggleCommentLike
    comments.ts         ~120 lines  - getNFTComments, postComment, addComment, addCommentWithImage, editComment + related types
    notifications.ts    ~180 lines  - Notification types + getNotifications, markAsRead, etc.
    reports.ts          ~120 lines  - Report types + functions (v1 + v2)
    dm.ts               ~500 lines  - DM/messaging types + all conversation/message/group functions
    livestream.ts       ~200 lines  - Livestream types + functions + getDHBPrice
    content.ts          ~200 lines  - mintPost, mintNFT, editPost, deletePost, updateTokenVisibility + types
    subscriptions.ts    ~150 lines  - Plan and subscription types + functions
    livechat.ts         ~200 lines  - LiveChat room/message types + functions
    leaderboard.ts      ~70 lines   - LeaderboardEntry type + getLeaderboard
```

## How It Works

1. Each domain module imports shared utilities from `./core` and types from `./types`
2. `index.ts` does `export * from './core'; export * from './types'; export * from './auth';` etc.
3. The original `dehub.ts` becomes a one-liner: `export * from './dehub/index';`
4. All 67 consumer files continue importing from `'@/lib/api/dehub'` unchanged

## Cleanup

- Remove dead `voteOnNFT` function (never imported anywhere)
- Consolidate duplicate `VoteResponse` into a single definition in `social.ts`

## What Does NOT Change

- No consumer file imports are modified
- No function signatures change
- No type definitions change (except removing the unused duplicate)
- `dpay.ts`, `view-tracker.ts`, and edge functions are untouched
