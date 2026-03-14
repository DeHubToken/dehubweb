

# Governance Voting Bug Fix

## Root Cause: Stale `currentVote` on Rapid Vote Changes

The core issue is a race condition between React renders and vote mutations.

**How it happens:**
1. User clicks Like. `voteMutation.mutate()` fires (sync, fire-and-forget). `onMutate` optimistically patches the React Query cache (+1 like).
2. React schedules a re-render but **hasn't flushed yet**.
3. ActionBar's `isVoting` guard resets almost instantly because `await onLike()` resolves synchronously (it calls `mutate()`, not `mutateAsync()`).
4. User quickly clicks Dislike. The component still has the **stale** `currentVote = undefined` from the pre-render state.
5. The second mutation receives `currentVote: undefined`, so `onMutate` treats it as a **new** dislike (instead of a switch from like), adding +1 dislike without removing the +1 like.
6. UI now shows `like_count = 1, dislike_count = 1` — "more than supposed to."

**Secondary bug:** `onSettled` invalidates `['governance-proposals']` (list) but not `['governance-proposal', proposalId]` (detail page query). The detail page never refreshes vote counts after voting.

## Fixes

### 1. Read current vote from cache in `onMutate` (src/hooks/use-governance.ts)

Instead of trusting the `currentVote` parameter (which can be stale), read it directly from the React Query cache inside `onMutate`. This is always up-to-date because previous `onMutate` calls patch it synchronously.

```typescript
onMutate: async ({ proposalId, voteType, voteWeight }) => {
  // ...cancel queries, snapshot...

  // Read ACTUAL current vote from cache (not the stale prop)
  const cachedVotes = queryClient.getQueryData(
    ['governance-votes', walletAddress]
  ) as Record<string, { type: number; weight: number }> | undefined;
  const actualCurrentVote = cachedVotes?.[proposalId]?.type;
  const oldWeight = cachedVotes?.[proposalId]?.weight ?? voteWeight;

  // Use actualCurrentVote for all delta calculations...
}
```

### 2. Disable ActionBar during pending mutation (src/pages/app/GovernancePage.tsx + GovernanceProposalPage.tsx)

Pass a `disabled` prop to ActionBar when `voteMutation.isPending` is true, preventing rapid double-clicks entirely.

### 3. Invalidate detail page query in `onSettled` (src/hooks/use-governance.ts)

Add `governance-proposal` to the invalidation list:
```typescript
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
  queryClient.invalidateQueries({ queryKey: ['governance-proposal'] });
  queryClient.invalidateQueries({ queryKey: ['governance-votes'] });
},
```

### 4. Also patch detail page cache in `onMutate`

Add optimistic update for `['governance-proposal', proposalId]` so the detail page shows immediate feedback too.

## Files Changed
- `src/hooks/use-governance.ts` — Fix stale vote read, add detail query invalidation + optimistic patch
- `src/pages/app/GovernancePage.tsx` — Pass disabled state to ActionBar
- `src/pages/app/GovernanceProposalPage.tsx` — Pass disabled state to ActionBar
- `src/components/app/cards/ActionBar.tsx` — Accept and respect `disabled` prop

