

## Problem Analysis

### 1. Command Centre "Recent Transactions" showing no purchases

The `getDPayTransactions()` function in `src/lib/api/dpay.ts` (line 359) fetches `/api/dpay/tnxs` **without any pagination params**, so the API returns only page 1 (10 items). All 10 items on page 1 happen to be `failed` transactions. The function then **filters to only `complete`/`completed`** status (lines 384-388), resulting in zero transactions.

The @early account's 3 successful purchases are on page 2. They never get fetched.

**Fix**: Fetch all pages (or a large limit like 100) so completed transactions are included. Alternatively, request the API with a larger limit.

### 2. Failed transaction reasons

The API already provides failure reasons in the response:
- `status_stripe`: `"failed"` or `"expired"`  
- `stripe_hooks`: e.g. `[{"checkout.session.expired": "expired"}]`
- `tokenSendStatus`: `"cancelled"`

So yes, we get reasons. The most common one is `checkout.session.expired` (user didn't complete Stripe checkout within 30 min).

## Plan

### Fix 1: `getDPayTransactions()` in `src/lib/api/dpay.ts`

Change the fetch to request a larger limit (e.g., `?limit=100`) so it captures completed transactions that would otherwise be buried behind failed ones on later pages. Keep the completed-only filter since this function feeds the Command Centre which only cares about successful transactions.

```typescript
const response = await fetch(`${DEHUB_API_BASE}/api/dpay/tnxs?limit=100`, {
```

### Fix 2: Show failure reasons on BuyCoinsPage

In the `getAllDPayTransactions` mapper, extract the failure reason from `stripe_hooks` and expose it. Update the Recent Purchases UI to show the reason (e.g., "Session expired") next to the ❌ icon as a tooltip or small label.

- Add `failureReason` field to mapped transaction
- Parse from `stripe_hooks` array: extract the first key-value pair's key (e.g., `checkout.session.expired` → "Session expired")
- Display as subtle text or tooltip next to the status icon

### Files to modify
- `src/lib/api/dpay.ts` — increase limit in `getDPayTransactions`, add `failureReason` to `getAllDPayTransactions` mapper
- `src/pages/app/BuyCoinsPage.tsx` — display failure reason in the purchase list

