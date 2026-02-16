

## Problem: New users with significant holdings are missing from the leaderboard

### Root Cause

The leaderboard cache refresh function discovers users through two methods:
1. The DeHub API leaderboard endpoint (returns a fixed/limited set of known users)
2. A profile discovery step that searches the DeHub API with single-character prefixes (a-z, 0-9) limited to **50 results per prefix**

With the letter "p" alone likely having well over 50 registered accounts, the user "pokemon" (who signed up 3 days ago with 5.8M tokens) never gets returned in the discovery results. They simply fall outside the top 50 for prefix "p".

### Solution

Increase the discovery coverage by:

1. **Use two-character prefixes instead of one-character** -- search for "pa", "pb", ..., "po", "pp", etc. This dramatically increases the number of unique users that can be discovered (up to ~46,800 vs current ~1,800).

2. **Increase the per-prefix limit from 50 to 100** for additional safety margin.

3. **Add pagination support** -- if a prefix returns the maximum number of results, fetch additional pages to ensure no one is missed.

---

### Technical Details

**File**: `supabase/functions/refresh-leaderboard-cache/index.ts`

**Change 1**: Generate two-character prefixes instead of single characters.

Replace the current `SEARCH_PREFIXES` constant (single chars "a"-"z", "0"-"9") with a function that generates all two-character combinations from those same characters (e.g., "aa", "ab", ..., "az", "a0", ..., "a9", "ba", ..., "99"). This produces 1,296 prefixes instead of 36.

**Change 2**: Add pagination to `searchProfiles`.

When a prefix returns 100 results (the max), continue fetching page 2, page 3, etc. until fewer results are returned. This ensures even popular prefixes capture all registered accounts.

**Change 3**: Increase the batch delay between prefix groups slightly (from 300ms to 500ms) since we're making more requests, and reduce the concurrent batch size from 6 to 4 to avoid rate limiting the DeHub API.

**Change 4**: Increase per-search limit from 50 to 100.

This will ensure that "pokemon" and any other new users with significant holdings are discovered and included in the leaderboard cache on the next refresh cycle.

