

## Fix: Badge Not Showing for All Qualified Users on Leaderboard

### Problem
Badges only appear for some users on the leaderboard, even though everyone with 10k+ DHB should have one. The root cause is that the leaderboard makes a **separate** on-chain RPC call (`useBatchBadgeBalances`) using `entry.account` to determine badges, but this can fail or return 0 for some users due to RPC inconsistencies or address mismatches.

Meanwhile, the leaderboard cache **already has** the correct `badgeBalance` pre-computed on each entry (populated by the `refresh-leaderboard-cache` function), but it's completely ignored.

### Solution
Use the pre-computed `entry.badgeBalance` from the leaderboard data as the primary source for badge display, falling back to the batch RPC result only if the cached value is missing. This also removes unnecessary RPC calls, improving performance.

---

### Technical Changes

**`src/pages/app/LeaderboardPage.tsx`**

- Change badge lookup on line 365 from:
  ```
  getBadgeUrl(badgeBalances[entry.account.toLowerCase()])
  ```
  to:
  ```
  getBadgeUrl(entry.badgeBalance ?? badgeBalances[entry.account.toLowerCase()])
  ```
- This prioritizes the already-available cached balance while keeping the batch call as a fallback.

**`src/components/app/sidebar/SidebarLeaderboard.tsx`**

- Apply the same fix: use `entry.badgeBalance` as the primary badge source, with the batch RPC as fallback.

This ensures every leaderboard user with 10k+ DHB (holdings + staked) shows their badge, using data that's already been computed and cached.
