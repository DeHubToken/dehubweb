

## Root Cause: API value vs snapshot mismatch for short periods

The `computeSnapshotDelta` function uses **two different data sources** for holdings deltas:

- **Current value**: `entry.total` from the live DeHub API call (e.g., 56,142,985 for coinage)
- **Past value**: `balance` from `leaderboard_snapshots` table

The snapshots from Feb 14 onward store **50,000,000** for coinage (what the `/api/leaderboard` endpoint returns as `total`), but the live API call at delta-computation time returns **56,142,985** (which may include additional data like staking). This creates a fake delta of 6.1M.

Why 1m/1y are correct: snapshots from before Feb 14 were created by the **old on-chain code** and stored 56,142,985 — matching the current API value. So `56M - 56M = 0`, no fake delta.

Why 1d/1w are wrong: recent snapshots (Feb 14+) store 50M from the new API-only code, but the live `entry.total` is 56M. So `56M - 50M = 6.1M` fake delta.

### Database evidence

| Date | Snapshot balance | API `entry.total` | Source |
|------|-----------------|-------------------|--------|
| Feb 13 (old code) | 56,142,985 | — | On-chain `balanceOf` |
| Feb 14+ (new code) | 50,000,000 | 56,142,985 | `/api/leaderboard` |

137 users show positive deltas in 1d — most are fake, caused by this same mismatch.

---

## Fix

**File: `supabase/functions/refresh-leaderboard-cache/index.ts`**

Change lines 189-204 in `computeSnapshotDelta` to use **today's snapshot** as the current value for ALL sort modes (not just sentTips/receivedTips). This ensures apples-to-apples comparison: snapshot vs snapshot.

Currently (lines 189-204):
```typescript
// Only sentTips/receivedTips use snapshot-vs-snapshot
if (sortMode === "sentTips" || sortMode === "receivedTips") {
  // loads today's snapshot as currentMap
}
// Everything else uses entry.total from API (mismatched!)
```

Change to:
```typescript
// ALL sort modes use snapshot-vs-snapshot
const snapshotFieldMap: Record<string, string> = {
  holdings: "balance",
  sentTips: "sent_tips",
  receivedTips: "received_tips",
  followers: "followers",
  likes: "likes",
  subscribers: "subscribers",
};
const currentSnapshotField = snapshotFieldMap[sortMode] || sortMode;
const todayStr = new Date().toISOString().split("T")[0];
const { data: currentSnaps } = await supabase
  .from("leaderboard_snapshots")
  .select(`account, ${currentSnapshotField}`)
  .eq("snapshot_date", todayStr);

if (currentSnaps && currentSnaps.length > 0) {
  currentMap = new Map<string, number>();
  for (const snap of currentSnaps) {
    currentMap.set(
      snap.account.toLowerCase(),
      (snap as any)[currentSnapshotField] ?? 0
    );
  }
}
```

This is one small indexed DB query per sort mode — negligible cost. After deploying, trigger a manual full refresh to rebuild the 1d/1w caches with correct deltas.

### Expected result
- Coinage 1d delta: `50M (today's snapshot) - 50M (yesterday's snapshot) = 0` — correct
- 1m/1y deltas: unchanged (already correct)
- Most 1d entries will show 0 delta unless there was a real change between snapshots

