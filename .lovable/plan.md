

# DeHub API Full Audit -- Cross-Referenced with Live Docs

After comparing every endpoint from `https://api.dehub.io/api/docxx` against the codebase (`src/lib/api/dehub/`), here is the definitive list of what exists, what's missing, and what needs updating.

---

## Already Implemented and Matching (No Changes Needed)

These modules match the API docs 1:1:

- **Auth** (`auth.ts`): `/api/username/check` (GET), `/api/web/auth` (POST)
- **Users** (`users.ts`): `/api/account_info/{id}`, `/api/users_count`, `/api/update_profile`
- **Social** (`social.ts`): `/api/request_follow`, `/api/is_following`, `/api/follow_list/{address}`, `/api/follow-requests` (GET + accept/reject/accept-all/reject-all), `/api/request_vote`, `/api/like_comment`
- **Feed** (`feed.ts`): `/api/feed`, `/api/nft_info/{id}`, `/api/record-view/{tokenId}`, `/api/savePost`, `/api/savedPosts`, `/api/liked_videos`, `/api/my_watched_nfts`, `/api/get_categories`, `/api/getServerTime`, `/api/claim-bounty`, `/api/unlocked_nfts/{id}`, `/api/view/batch`
- **Comments** (`comments.ts`): `/api/nft/{tokenId}/comments`, `/api/request_comment`, `/api/comment_image`, `/api/comment_audio`, `/api/edit_comment`
- **Content** (`content.ts`): `/api/user_mint`, `/api/nft/{tokenId}` (PATCH + DELETE), `/api/token_visibility`
- **Notifications** (`notifications.ts`): `/api/notification`, `/api/notification/unread-count`, `/api/notification/{id}` (PATCH), `/api/notification/mark-all-read`
- **Reports** (`reports.ts`): All 8 report endpoints (legacy + v2)
- **Livestream** (`livestream.ts`): All 10 livestream endpoints
- **LiveChat** (`livechat.ts`): All 10 livechat endpoints
- **Subscriptions** (`subscriptions.ts`): All 7 subscription/plan endpoints
- **DM** (`dm.ts`): All DM endpoints
- **Leaderboard** (`leaderboard.ts`): `/api/leaderboard` (recently updated)
- **Search** (`feed.ts`): `/api/search`, `/api/search/suggestions`, `/api/search/log`

---

## Missing Endpoints to Add

### Priority 1 -- Core Features

| # | Endpoint | Method | Module | Description |
|---|----------|--------|--------|-------------|
| 1 | `/api/comment_gif` | POST | `comments.ts` | Add GIF comment (Giphy/Tenor URL) |
| 2 | `/api/delete_comment` | DELETE | `comments.ts` | User deletes own comment |
| 3 | `/api/users_search` | GET | `users.ts` | Dedicated user search |
| 4 | `/api/users/{address}/comments` | GET | `users.ts` | Get a user's comment history |
| 5 | `/api/suggested-accounts` | GET | `users.ts` | Suggested accounts to follow |
| 6 | `/api/myPosts` | GET | `feed.ts` | Get authenticated user's own posts |
| 7 | `/api/username/check` | POST | `auth.ts` | POST variant of username check |

### Priority 2 -- Blocks (Entirely Missing Module)

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 8 | `/api/block` | POST | Block a user |
| 9 | `/api/block/{address}` | DELETE | Unblock a user |
| 10 | `/api/block` | GET | Get your block list |
| 11 | `/api/block/blocked-by` | GET | Get who blocked you |
| 12 | `/api/block/status/{address}` | GET | Check block status |

New file: `src/lib/api/dehub/blocks.ts`

### Priority 3 -- Push Notifications (Entirely Missing Module)

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 13 | `/api/push/token` | POST | Register push token |
| 14 | `/api/push/token/{deviceId}` | DELETE | Unregister push token |
| 15 | `/api/push/tokens` | DELETE | Unregister all tokens |
| 16 | `/api/push/devices` | GET | Get registered devices |
| 17 | `/api/push/preferences` | GET | Get notification preferences |
| 18 | `/api/push/preferences` | POST | Update preferences |
| 19 | `/api/push/preferences/reset` | POST | Reset to defaults |

New file: `src/lib/api/dehub/push.ts`

### Priority 4 -- Payments (Mostly Missing)

Currently only `/api/dpay/price` exists in `livestream.ts`. Missing:

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 20 | `/api/dpay/available/tokens` | GET | Available payment tokens |
| 21 | `/api/dpay/available/gas` | GET | Available gas |
| 22 | `/api/dpay/tnxs` | GET | Transaction history |
| 23 | `/api/dpay/price/{chainId}` | GET | Price by chain |
| 24 | `/api/dpay/total` | GET | Total stats |
| 25 | `/api/dpay/checkout` | POST | Create checkout |
| 26 | `/api/dpay/tk` | POST | Create ticket |
| 27 | `/api/dpay/create-onramp-session` | POST | Create onramp session |

New file: `src/lib/api/dehub/payments.ts` (move `getDHBPrice` from `livestream.ts`, keep re-export for backward compat)

### Priority 5 -- Admin Endpoints (Optional)

These are admin-only endpoints. Only implement if an admin panel is planned:

- **Admin Livestreams**: 6 endpoints (`/api/admin/livestreams/...`)
- **Admin Reports & Moderation**: 7 endpoints (`/api/admin/reports/...`)
- **Admin Comments**: 8 endpoints (`/api/admin/comments/...`)

---

## Implementation Details

### Files to create:
1. `src/lib/api/dehub/blocks.ts` -- 5 functions
2. `src/lib/api/dehub/push.ts` -- 7 functions
3. `src/lib/api/dehub/payments.ts` -- 9 functions (including moved `getDHBPrice`)

### Files to modify:
1. `src/lib/api/dehub/comments.ts` -- add `addGifComment()`, `deleteComment()`
2. `src/lib/api/dehub/users.ts` -- add `searchUsers()`, `getUserComments()`, `getSuggestedAccounts()`
3. `src/lib/api/dehub/feed.ts` -- add `getMyPosts()`
4. `src/lib/api/dehub/auth.ts` -- add POST variant of `checkUsernameAvailability`
5. `src/lib/api/dehub/livestream.ts` -- keep `getDHBPrice` as re-export from payments for backward compat
6. `src/lib/api/dehub/index.ts` -- add exports for `blocks`, `push`, `payments`

### Pattern to follow:
All new functions use the existing `apiCall` helper with defensive `result` unwrapping, matching every other function in the codebase. Example:

```text
export async function blockUser(address: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/block", {
    method: "POST",
    body: { address: address.toLowerCase() },
    requiresAuth: true,
  });
}
```

### What is NOT changing:
- No existing endpoint implementations are being modified
- No UI changes in this pass (API layer only)
- Historical leaderboard cache logic stays untouched
- All existing imports continue working via barrel exports
