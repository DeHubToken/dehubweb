

## Analysis: Badge Balance Edge Function is Redundant

You are correct. The DeHub API already returns `badgeBalance` on virtually every user/account object:

- **Feed posts**: `minterUser.badgeBalance` is included in every post response
- **Suggested accounts**: `badgeBalance` field on each account
- **Live streams**: `account.badgeBalance` on each stream
- **Leaderboard**: Already cached with `badgeBalance` embedded
- **Profile lookups**: The profile API returns `badgeBalance`

### Where the Edge Function is Still Being Called (Unnecessarily)

| Consumer | What it does | Can use API data instead? |
|---|---|---|
| `BadgeBalanceContext` (batch) | Fires `get-badge-balance` edge function for livechat messages, DM list, sidebar chat, live post chat | Yes -- these contexts have the sender's address, and the API already provided `badgeBalance` when the data was fetched |
| `useBadgeBalance` (individual) | Used on profile page | Yes -- profile API returns `badgeBalance` |
| `useVerifyUnlock` | Real-time on-chain verification for gated content | **No -- this one is legitimate**. Gated content needs a fresh on-chain check, not a cached API value |

### Plan

**Phase 1: Stop calling the edge function for display badges**

1. **Feed posts / VideoCard / PostCard** -- Already using API-provided `creatorBadgeBalance`. No change needed.

2. **Leaderboard / Sidebar Leaderboard** -- Already using cached `entry.badgeBalance`. No change needed.

3. **Livechat (`ChatMessage.tsx`, `LivePostChat.tsx`)** -- Instead of `useBatchedBadgeBalance(address)` calling the edge function, pass `badgeBalance` from the message/user data that the API already provided.

4. **DM list (`MessagesPage.tsx`)** -- The DM conversation list comes from the API with user profile data. Thread the `badgeBalance` through instead of calling the edge function.

5. **Sidebar chat (`SidebarChat.tsx`)** -- Same approach: use the balance already available from the conversation/user data.

6. **Profile page (`ProfilePage.tsx`)** -- The profile API response includes `badgeBalance`. Pass it to the badge component directly instead of wrapping in `BadgeBalanceProvider`.

**Phase 2: Remove dead code**

7. Remove the `BadgeBalanceProvider` and `BadgeBalanceContext.tsx` entirely (no longer needed).

8. Remove `useBadgeBalance` hook from `use-badge-balance.ts` (the batch variant too).

9. Keep `useVerifyUnlock` -- it is the only legitimate use case (real-time on-chain balance check for content gating).

**Phase 3: Keep edge function for gating only**

10. The `get-badge-balance` edge function stays deployed but is only called by `useVerifyUnlock` when a user tries to unlock gated content -- a rare, intentional action, not a per-scroll event.

### Impact

- Eliminates hundreds of edge function invocations per session (every scroll, every chat message, every DM list render)
- Keeps the one legitimate use case: on-chain verification for content unlocking
- No visual changes -- badges still appear everywhere, just sourced from data the API already gave us

