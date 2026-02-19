
# Cloud Cost Reduction Opportunities

Based on a thorough audit of the database, edge functions, frontend hooks, and logging system, here are the concrete cost-reduction opportunities found, ordered by expected impact.

---

## 1. Stop Logging `info` Events to the Backend (HIGH IMPACT)

**Finding**: The `client_error_logs` table is growing at ~1,700–2,000 rows per day. Of today's ~1,985 logs, **1,748 (88%) are `info` level** — and the top single source is `TVPreviewCard: "Initializing thumbnail player"` at **1,473 entries in 24 hours**. Every single one of these is a roundtrip edge function call (`client-logs`) + a DB insert.

**Root cause**: `src/lib/logger.ts` sends ALL levels (`info`, `warn`, `error`) to the backend. `info` logs are purely for developer debugging and have zero operational value once deployed.

**Fix**: Update `logToBackend()` to only forward `error` and `warn` levels. `info` logs should remain console-only.

```typescript
// src/lib/logger.ts — change this:
export async function logToBackend(data: LogData) {
  console[consoleMethod](`...`);
  
  // NEW: skip backend call for info/debug
  if (data.level === 'info' || data.level === 'debug') return;

  try {
    await supabase.functions.invoke('client-logs', { body: data });
  } catch { ... }
}
```

**Estimated savings**: ~1,500 edge function invocations/day + DB inserts eliminated immediately.

---

## 2. Add Automatic Cleanup for `client_error_logs` (MEDIUM IMPACT)

**Finding**: The table has 13,561 rows with no TTL or cleanup mechanism. At the current rate it will grow indefinitely, consuming storage and making queries slower. The oldest logs visible are from Feb 15 and have no value after a week.

**Fix**: Add a scheduled database function via a SQL migration to delete logs older than 30 days. This can be wired to a pg_cron job.

```sql
-- Delete error logs older than 30 days
DELETE FROM public.client_error_logs
WHERE created_at < NOW() - INTERVAL '30 days';
```

---

## 3. Reduce Feed Cache from 5 Pages to 3 Pages (MEDIUM IMPACT)

**Finding**: `refresh-feed-cache` currently caches **10 configurations** (5 pages × Latest + Popular feeds), running **hourly**. The memory notes say the original plan was 4 pages; it's now been expanded to 5. Each run makes 10 API calls to `api.dehub.io` + 10 DB upserts.

The vast majority of users never scroll past page 2 or 3. Pages 4 and 5 are fetched live on demand with TanStack Query anyway (10-minute staleTime).

**Fix**: Roll back to 3 pages for each feed (6 total configs) by removing `feed_latest_page4`, `feed_latest_page5`, `feed_popular_page4`, `feed_popular_page5` from `CACHE_CONFIGS` in `supabase/functions/refresh-feed-cache/index.ts`.

**Estimated savings**: 40% reduction in feed cache function cost (4 fewer HTTP calls + DB upserts per hourly run).

---

## 4. Add TTL to `story_views` Table (LOW-MEDIUM IMPACT)

**Finding**: `story_views` has 610 rows but no cleanup policy. Stories expire after 24 hours but their view records remain forever. Since a story's view count is only relevant while the story is alive, views for expired stories are pure dead weight.

**Fix**: A simple periodic delete:
```sql
DELETE FROM public.story_views
WHERE viewed_at < NOW() - INTERVAL '7 days';
```

---

## 5. Fix the `ai_messages` TOAST Bloat (LOW IMPACT — No Code Change Needed)

**Finding**: The `ai_messages` table shows **114 MB total** for only 289 rows. The actual table + indexes are only ~200 KB. The remaining ~114 MB is in PostgreSQL's TOAST storage (where long text values live). This is expected for an AI chat system. However, running `VACUUM FULL` on this table would compact it significantly.

This is not a recurring cost issue — it's a one-time compaction. You can run this in Cloud → Run SQL:
```sql
VACUUM FULL public.ai_messages;
VACUUM FULL public.livechat_messages;
```

---

## Technical Implementation Plan

### Files to change:

**1. `src/lib/logger.ts`**
- Add an early return in `logToBackend()` when `level === 'info' || level === 'debug'`
- This is a 2-line change with the biggest single impact

**2. `supabase/functions/refresh-feed-cache/index.ts`**
- Remove the 5 cache configs for pages 4 and 5 from the `CACHE_CONFIGS` array
- Redeploy the function

**3. Database migrations (via migration tool)**
- Add a cleanup for `client_error_logs` older than 30 days — wire to a cron or run manually
- Add a cleanup for `story_views` older than 7 days

### What will NOT be changed:
- The notification polling interval (already at 60s, reasonable)
- The leaderboard cron schedule (already every 6 hours)
- The batch-avatars system (already optimally batched)
- Badge balance caching (already 5-minute TTL)
- The DM realtime subscription (necessary for real-time chat)

### Summary of expected impact:

| Change | Estimated Saving |
|---|---|
| Stop `info` logs going to backend | ~87% reduction in `client-logs` invocations |
| Trim feed cache to 3 pages | ~40% reduction in `refresh-feed-cache` cost |
| Auto-cleanup `client_error_logs` | Prevents unbounded DB storage growth |
| Auto-cleanup `story_views` | Keeps table lean as stories scale |
| VACUUM FULL (manual) | Reclaims ~114 MB of storage immediately |
