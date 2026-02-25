

## Root Cause Analysis: Daily/Weekly Leaderboard Bad Data

### The Problem

The leaderboard delta computation is producing inflated/fake numbers because of a **timing race between the light and full refresh cron jobs**.

### Timeline of Events

1. **Light refresh** (Job 10) runs at **00:00 UTC** every 6 hours
2. **Full refresh** (Job 9) runs at **03:00 UTC** daily

The light refresh at midnight ran **before** the full refresh created today's snapshot (Feb 25). Here's what the data shows:

- **No snapshot exists for 2026-02-25** (confirmed by query returning empty)
- Latest snapshots are from Feb 24 (503 entries, 353 non-zero) and Feb 23

### How the Bug Manifests

The `computeSnapshotDelta` function (line 189-215) tries to use **today's snapshot** as the "current" value to ensure snapshot-vs-snapshot comparison. When no today snapshot exists, it **falls back to raw API cache values** (line 214).

This creates mismatches:

- **Account `0x0851...` (coinage)**: Snapshot balance on Feb 23 and Feb 24 = **50,000,000**. But the holdings/all API cache says **56,142,985**. Delta = **+6,142,985** (fake -- it's not a real daily change, it's the gap between API and snapshot values).
- **Account `0x388bee...` (jimminycrockett)**: An EXTRA_WALLET not in the week-ago snapshot, so delta = full current value = **10,000,001** (also misleading).

### Why This Keeps Recurring

Every day between **00:00 and 03:00 UTC**, the light refresh overwrites the period caches with bad deltas. Even after the full refresh at 03:00 fixes them by creating today's snapshot, the next midnight light refresh will break them again for 3 hours. If users check during this window, they see bad data.

Additionally, the 06:00 and 12:00 light refreshes work fine because by then the full refresh has created today's snapshot.

### The Fix

Two changes needed in `refresh-leaderboard-cache/index.ts`:

1. **In light mode**: Before computing deltas, check if today's snapshot exists. If it doesn't, **skip the recomputation** and leave the existing cache intact rather than overwriting it with bad data. Add a guard at the top of the light mode block:

```typescript
// Light mode guard: don't recompute if today's snapshot is missing
const todayStr = new Date().toISOString().split("T")[0];
const { count: todaySnapCount } = await supabase
  .from("leaderboard_snapshots")
  .select("id", { count: "exact", head: true })
  .eq("snapshot_date", todayStr);

if (!todaySnapCount || todaySnapCount === 0) {
  console.warn("[light] No snapshot for today yet — skipping to avoid bad deltas");
  return new Response(
    JSON.stringify({ success: true, mode: "light", message: "Skipped: no today snapshot" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
}
```

2. **Shift the light refresh schedule** so midnight doesn't conflict. Change Job 10 from `0 */6 * * *` (0, 6, 12, 18) to `0 6,12,18 * * *` (skip midnight entirely since the 3 AM full refresh handles it).

### Files to Change

- `supabase/functions/refresh-leaderboard-cache/index.ts` -- Add the snapshot-exists guard in light mode (around line 314-333)
- Cron job update via SQL: reschedule Job 10 to skip midnight

### Immediate Fix

Trigger a full refresh now to create today's snapshot and fix the current bad data.

