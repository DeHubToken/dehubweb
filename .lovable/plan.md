
## Fix: Plans Not Showing After Creation

### Root Cause

There are two likely issues:

1. **`getMyPlans()` may not return plans correctly** -- It calls `/api/plans` with auth but no `creator` parameter. The API might require the `creator` query param to return the creator's plans, or it might need a different endpoint entirely.

2. **Query cache may not refresh properly** -- After plan creation, the invalidation uses `queryKey: ['plans']` which should match `['plans', 'self']`, but the `staleTime: 30000` could prevent an immediate refetch if the query was recently fetched.

### Changes

**File: `src/lib/api/dehub.ts`** (`getMyPlans` function)
- Update `getMyPlans()` to also pass the user's wallet address as the `creator` param, ensuring the API filters correctly. This aligns it with how `getPlans(creatorAddress)` works.
- Alternatively, if the API has a `/api/plans/me` endpoint, switch to that.

**File: `src/hooks/use-subscriptions.ts`** (`useCreatorPlans` hook)
- Simplify the logic: when viewing own plans, use `getPlans(walletAddress)` with the creator's address instead of the separate `getMyPlans()` path. This ensures consistent behavior.
- In `useCreatePlan`, after success, also call `refetch()` explicitly or reduce `staleTime` to ensure immediate refresh.

**File: `src/hooks/use-subscriptions.ts`** (`useCreatePlan` mutation)
- Add more specific query invalidation: `queryClient.invalidateQueries({ queryKey: ['plans', walletAddress?.toLowerCase() || 'self'] })` to target the exact cache entry.

### Summary
The fix ensures that fetching "my plans" uses the same API path as fetching any creator's plans (with the `creator` query param), and that the cache is properly invalidated after creation so plans appear immediately.
