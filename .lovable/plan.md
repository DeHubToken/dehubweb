

## Problem Analysis

The fiat purchase gets stuck on the "Processing Purchase" spinner because:

1. **Polling starts before payment is complete** — When the user clicks Buy, the checkout URL opens in a new tab and polling starts immediately in the original tab. But the backend has no transaction record yet because the user hasn't completed the Stripe checkout.

2. **Empty API responses aren't handled** — When `getDPaySessionStatus` returns an empty array (no transaction found for that session ID yet), the code sets `result = {}`. None of the status checks match (`sent`, `succeeded`, `failed`, etc.), so it just keeps polling silently for 3 minutes.

3. **The redirect URL with `__SESSION_ID__` opens in the new tab** — The success redirect goes to the new tab, not the original one, so the original tab never gets the URL-based confirmation either.

## Plan

### 1. Handle empty/missing session status gracefully
In `startPolling`, after parsing the API response, check if the result is empty/undefined. If so, just continue polling (it means the transaction hasn't been created yet). This is already happening, but the real fix is in #2.

### 2. Add optimistic early-exit for the original tab
After a reasonable number of polls with empty results (e.g., 20 polls = 30 seconds), if no status has been returned at all, assume the user either:
- Hasn't completed checkout yet (show a "Waiting for payment..." message)
- Or completed it and the session ID format doesn't match

### 3. Show better status messages during polling
- First phase (0-30s): "Complete payment in the checkout tab..."
- After 30s with no status: "Still waiting for payment confirmation..."
- After Stripe confirms: immediate success (already implemented)

### 4. Handle the empty result case explicitly in the polling
In the polling callback, when `result` is empty (no `status_stripe`, no `tokenSendStatus`), don't treat it as an unknown state — just skip that poll iteration. Also log a count so we can detect if the API never returns data for that session ID.

### Technical Changes

**File: `src/pages/app/BuyCoinsPage.tsx`**
- Add a `pollPhase` state or ref to track whether we've received any non-empty response
- Update the polling message text based on phase (waiting for checkout vs. processing tokens)
- After 60 empty polls (90s), auto-dismiss with a "check wallet" message instead of spinning forever
- Ensure `stripeConfirmed` short-circuits to success as designed

**File: `src/lib/api/dpay.ts` (getDPaySessionStatus)**
- When the API returns an empty array or `{}`, return a clearly typed "pending" status instead of spreading empty object fields, so the polling logic can distinguish "no data yet" from "data with unknown status"

