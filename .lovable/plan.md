

## Problem

The API call `GET /api/account_info/SableRaven_9847` returns 200 but with an **empty result** — no `_id`, no `username`, no `address`. This means the backend username lookup is **case-sensitive**. `SableRaven_9847` is a **display name** from `latestActorNames`, not the actual username.

The notification grid and drawer link to `/${actor.display}` (e.g. `/SableRaven_9847`), but the profile page then looks up that exact casing via the API and gets nothing back — resulting in the "Unknown Profile" / empty state.

Two issues to fix:

## Fix 1: Use enriched username for profile links (NotificationsPage)

When enrichment fetches `getAccountInfo("SableRaven_9847")`, the API returns an empty result (no username). But if the enrichment had resolved a wallet address + real username, it should be used for links.

**In `NotificationsPage.tsx`:**
- In the grid rendering (lines 560-563) and drawer links (line 719), replace `/${actor.display}` with a resolved username from enriched data when available.
- Add a helper `resolveActorLink(actor)` that checks the enriched cache for a matching key and returns `/${enrichedUsername}` if found, or falls back to `/${actor.display}`.
- Also store the enriched `username` keyed by `username:${normalizedDisplayName}` so lookups by display name work.

## Fix 2: Treat empty API results as "not found" (ProfilePage / mapUserToProfile)

When the API returns `{"result": {"balanceData":[], "followersList":[], ...}}` with no `_id`, no `username`, no `address`:

**In `use-dehub-profile.ts`:**
- After calling `getAccountByUsername` or `getAccountInfo`, check if the returned user has at least an `_id` or `address` or `username`. If none exist, return `null` (or throw) so the profile page renders the "not found" state instead of a broken "Unknown User" page.

## Fix 3: Enrichment stores username under display-name key

**In `NotificationsPage.tsx` enrichment (line 827-839):**
- When enriching by username/display name, also store the result under the `username:${normalizedInputName}` key so `findAvatarByUsername` and link resolution can find it.
- Currently if `getAccountInfo("SableRaven_9847")` returns empty (no address), the key becomes `username:sableraven_9847` with `username: "SableRaven_9847"` — but no real username is resolved. We should detect this empty-result case and avoid using it for links.

## Summary of changes

| File | Change |
|---|---|
| `src/hooks/use-dehub-profile.ts` | After API call, if result lacks `_id`/`address`/`username`, throw error so query fails → profile page shows "not found" |
| `src/pages/app/NotificationsPage.tsx` | Grid + drawer links use enriched resolved username when available; add `resolveActorLink` helper |

