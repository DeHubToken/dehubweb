
## Diagnosis: Why Day, Week (and previously Month/Year) Leaderboards Are Broken

### Root Cause: `backfill-tip-snapshots` is Poisoning Snapshot Data

The `backfill-tip-snapshots` edge function upserts rows into `leaderboard_snapshots` with only `sent_tips` and `received_tips` -- **without specifying `balance`, `followers`, `likes`, or `subscribers`**. Because it uses `upsert` with `onConflict: "account,snapshot_date"`:

- For wallets **already in the snapshot**: it overwrites the row, setting `balance` to the DB default of `0`
- For wallets **not yet in the snapshot**: it creates new rows with `balance=0`

This has corrupted every snapshot from Feb 15 onward. For example, yesterday's snapshot (Feb 21) has 502 entries but only 250 have non-zero balances. The delta calculation then sees `currentBalance - 0 = full balance` for ~252 wallets, producing wildly wrong results.

### Data Corruption Summary

| Snapshot Date | Total Entries | With Balance > 0 | Zero Balance |
|---|---|---|---|
| 2026-02-14 | 248 | 248 | 0 (clean) |
| 2026-02-15 to 2026-02-21 | 502 | ~250 | ~252 (corrupted) |
| 2026-02-22 | 503 | 349 | 154 (partially corrupted) |

### Fix Plan

**Step 1: Fix `backfill-tip-snapshots` to not overwrite balance data**

Update the upsert in `supabase/functions/backfill-tip-snapshots/index.ts` to only update the `sent_tips` and `received_tips` columns when a row already exists, and avoid creating new rows for wallets not already in the snapshot. Two approaches:

- Option A: Use a raw SQL `ON CONFLICT ... DO UPDATE SET sent_tips = ..., received_tips = ...` to only touch tip columns
- Option B: First check which wallets already have snapshot rows, then only upsert those (preserving balance), and insert tip-only wallets separately with their actual balance

The simplest fix: change the upsert to use `ignoreDuplicates: true` for wallets not in the snapshot, or better yet, switch to an UPDATE-only approach for existing rows and skip wallets that don't have existing snapshot entries.

**Step 2: Repair corrupted snapshots (Feb 15-22)**

For snapshots from Feb 15 to Feb 22, delete rows where `balance = 0` that were inserted by the tip backfill. These are wallets that shouldn't have been in the snapshot at all, or whose balance was overwritten to zero.

```sql
DELETE FROM leaderboard_snapshots
WHERE snapshot_date >= '2026-02-15'
  AND balance = 0;
```

**Step 3: Improve the snapshot quality guard**

The current `MIN_SNAPSHOT_ENTRIES >= 10` check is insufficient -- it only checks row count, not data quality. Enhance `computeSnapshotDelta` to also verify that the snapshot has a reasonable number of entries with non-zero values for the relevant field (e.g., `balance > 0` for holdings).

**Step 4: Re-trigger leaderboard refresh**

After cleanup, invoke `refresh-leaderboard-cache` to rebuild all period caches with correct data.

### Technical Details

**File: `supabase/functions/backfill-tip-snapshots/index.ts` (~line 312)**

The current code:
```typescript
const rows = batch.map((wallet) => ({
  account: wallet.toLowerCase(),
  snapshot_date: dateStr,
  sent_tips: totalSpent.get(wallet) || 0,
  received_tips: totalEarned.get(wallet) || 0,
}));
// This upsert OVERWRITES existing rows, zeroing out balance/followers/etc
await supabase.from("leaderboard_snapshots").upsert(rows, { onConflict: "account,snapshot_date" });
```

Will be changed to only UPDATE existing snapshot rows (tip columns only), never creating new rows or touching balance:
```typescript
// For each wallet, UPDATE only sent_tips and received_tips on existing rows
await supabase.from("leaderboard_snapshots")
  .update({ sent_tips: ..., received_tips: ... })
  .eq("account", wallet).eq("snapshot_date", dateStr);
```

**File: `supabase/functions/refresh-leaderboard-cache/index.ts` (~line 350)**

Enhance the quality guard to check non-zero entries, not just total count, for the relevant sort field.
