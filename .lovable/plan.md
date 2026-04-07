

## Fix: Tip count not updating on post after tipping

### Problem
The optimistic tip flow fires `onSuccess` (which invalidates the tip count query) **before** the tip is written to the database. The timeline is:

1. Tx submitted → `onSuccess()` fires → query invalidated → refetches from DB → **record not there yet**
2. Tx confirmed → DB insert happens → but no one re-invalidates the query

### Solution
Two changes needed:

**1. Optimistically update the tip count cache immediately (no DB round-trip needed)**

In `TipModal.tsx`, instead of just invalidating the query, **optimistically increment** the cached tip count by the tipped amount:

```ts
// In onSuccess callback:
queryClient.setQueryData(['post-tip-count', resolvedTokenId], (old: number) => (old || 0) + parsedAmount);
```

This gives instant UI feedback without waiting for DB.

**2. Re-invalidate after the DB write completes**

In `use-tip-payment.ts`, after the confirmed DB insert succeeds, call a second invalidation so the count reconciles with the real DB total. Pass `queryClient` or expose a second callback (`onConfirmed`) that the TipModal can use to invalidate again.

### Files to change

| File | Change |
|------|--------|
| `src/hooks/use-tip-payment.ts` | Add `onConfirmed` callback param; call it after DB insert succeeds |
| `src/components/app/modals/TipModal.tsx` | Optimistically set tip count in `onSuccess`; invalidate query in `onConfirmed` |

### Result
- Tip count updates **instantly** on the post after tipping
- Once tx confirms and DB write completes, the count reconciles with the real total

