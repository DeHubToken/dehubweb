

## Diagnosis: Month and Year Leaderboard Broken by Corrupted Snapshots

### Root Cause

The `computeSnapshotDelta` function finds the closest snapshot date on or before the target period date. For **month** (~Jan 23) and **year** (~Feb 2025), it picks up corrupted/partial snapshots that have only 3-4 entries with **all-zero values**:

| Snapshot Date | Entries | Balance Data |
|---|---|---|
| 2026-01-14 | 3 | All zeros |
| 2025-02-13 | 4 | All zeros |
| 2026-02-06 | 2 | Likely zeros |

Meanwhile, the **good** snapshots sit just behind them:

| Snapshot Date | Entries | Avg Balance |
|---|---|---|
| 2026-01-12 | 348 | ~3.3M |
| 2025-02-11 | 348 | Has real data |
| 2026-02-04 | 348 | Has real data |

Since the delta formula is `current - past`, and past = 0 for only 3 wallets, the result is only 3 entries showing up for month (matching the cache showing `count: 3`).

### Fix Plan

**Step 1: Clean up corrupted snapshots (database)**

Delete the poisoned snapshot rows that have zero balances and suspiciously low entry counts. These appear to be failed/partial backfill runs.

**Step 2: Add snapshot quality guard in the edge function**

Update `computeSnapshotDelta` in `refresh-leaderboard-cache/index.ts` to skip snapshots that have fewer than a minimum threshold of entries (e.g., 10). This prevents future corrupted snapshots from poisoning results. The logic change:

- After finding the closest snapshot date, check entry count
- If count is below threshold, look for the next-closest date
- Fall back gracefully if no valid snapshot exists

**Step 3: Re-trigger the leaderboard refresh**

After cleanup, invoke `refresh-leaderboard-cache` to rebuild month/year caches with correct snapshot data.

### Technical Details

In `supabase/functions/refresh-leaderboard-cache/index.ts`, the `computeSnapshotDelta` function (around line 350) currently does:

```text
SELECT snapshot_date FROM leaderboard_snapshots
WHERE snapshot_date <= pastDateStr
ORDER BY snapshot_date DESC LIMIT 1
```

This will be enhanced to validate the snapshot has sufficient entries before using it, falling back to older snapshots if needed.

The corrupted dates to delete: `2026-01-14`, `2026-02-06`, `2025-02-13`.

