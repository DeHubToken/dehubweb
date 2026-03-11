

# Fix: Talk of the Town stops scanning early on 429 errors

## Root Cause

In `fetchPage()`, a 429 response returns `null`. In the main loop, `null` triggers `hitEnd = true` or `break`, stopping the scan. The incomplete data then gets cached as if all pages were scanned. On mainnet, where there's more traffic and more concurrent API calls, 429s happen earlier and more often.

## Fix — `src/hooks/use-trending-categories.ts`

1. **Distinguish 429 from empty results**: Change `fetchPage` to return a sentinel value (e.g., `'rate-limited'`) instead of `null` for 429s, and `null` only for truly empty/error responses.

2. **Retry on 429**: When a 429 is encountered, wait longer (1-2 seconds) and retry up to 2 times before giving up on that page.

3. **Don't cache incomplete scans as complete**: Only set `lastPageScanned` to a page number if that page was successfully fetched. If scanning was cut short by a 429, save what we have but with the correct `pagesScanned` so the next run resumes from the right spot.

4. **Increase delay between sequential requests** from 350ms to 500ms to reduce 429 likelihood.

5. **Stagger the initial parallel batch**: Instead of firing 3 requests simultaneously, fire them with 200ms gaps to avoid triggering the rate limiter.

### Key changes:
- `fetchPage` returns `{ data, rateLimited }` instead of `any[] | null`
- Add retry logic with exponential backoff (500ms, 1500ms) for 429s
- Sequential delay increased from 350ms to 500ms
- Parallel batch replaced with staggered requests (200ms apart)
- Cache only records pages that were actually successfully fetched

