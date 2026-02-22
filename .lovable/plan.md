

## Cloud Credit Optimization: PPV Checks & Client Logs

### Problem 1: PPV Purchase Check on Every Feed Load
The `use-unified-feed.ts` hook queries `ppv_purchases` for ALL purchased token IDs on every feed load for every logged-in user. This is wasteful -- the unlock status should only matter when the user tries to view/unlock a specific post, not on every scroll.

**Fix:**
- Remove the `ppv-purchased-tokens` query from `use-unified-feed.ts`
- The existing PPV unlock flow in `use-ppv-payment.ts` already checks `ppv_purchases` when the user clicks "Pay" -- that's the correct place
- The DeHub API already provides `isOwner` and `isUnlocked` flags per post, which already bypass gating overlays -- no local DB check needed in the feed

### Problem 2: Client Logs Edge Function Overhead
10 components use `createLogger`, and while `info`/`debug` are console-only, every `error` or `warn` triggers an edge function call (`client-logs`) + DB insert. Auth success events are deliberately logged as `warn`, meaning every login = 1 edge function invocation.

**Fix:**
- Batch client logs: instead of firing the edge function per error/warn, queue them in memory and flush every 30 seconds (or on page unload)
- Downgrade auth success logs from `warn` to `info` so they stay console-only (they were elevated for diagnostics which is no longer needed)
- This alone could cut `client-logs` invocations by 80-90%

### Problem 3: PPV Purchase Count on Every Card
`usePPVPurchaseCount` is called inside `VideoCard`, `ImageCard`, and `PostInfoPage` for every PPV post visible in the feed. Each card that renders triggers a separate DB query.

**Fix:**
- For feed cards, move the purchase count fetch to only trigger on `PostInfoPage` (where it's meaningful)
- In feed cards, show "PPV" badge without the count, or use data from the DeHub API if available

---

### Technical Details

**Files to modify:**

1. `src/hooks/use-unified-feed.ts` -- Remove `ppv-purchased-tokens` query and `purchasedTokenIds` usage
2. `src/lib/logger.ts` -- Add batching: queue logs in an array, flush via `setInterval` (30s) and `visibilitychange`/`beforeunload`
3. `src/contexts/AuthContext.tsx` -- Change auth success log from `warn` to `info`
4. `src/components/app/cards/VideoCard.tsx` -- Remove `usePPVPurchaseCount` call (only show static "PPV" label)
5. `src/components/app/cards/ImageCard.tsx` -- Remove `usePPVPurchaseCount` call (only show static "PPV" label)
6. `src/hooks/use-bookmarks.ts` -- Has a similar `ppv_purchases` query for bookmarks; keep but add longer staleTime

**Estimated credit savings:**
- PPV feed query removal: ~1 DB query per feed load per user
- PPV count per card removal: ~N DB queries per feed page (one per PPV card)
- Logger batching: reduces edge function calls from per-error to ~2/minute max
- Auth log downgrade: eliminates 1 edge function call per login

