

## Current Status of `get-badge-balance`

It is **still in use** in one place:

- `src/hooks/use-verify-unlock.ts` calls it directly
- `VerifyUnlockButton` (used in `ImageCard` and `VideoCard`) depends on that hook to verify DHB balance before unlocking gated content

## Option to Remove It

Refactor `use-verify-unlock.ts` to check the user's `badgeBalance` from the DeHub API profile (already fetched via `use-dehub-profile`) instead of calling the edge function. This would:

1. **Eliminate** the last consumer of `get-badge-balance`
2. Allow full deletion of the edge function and its `config.toml` entry
3. Save edge function invocations every time someone unlocks gated content

**Tradeoff**: The DeHub API balance is cached for a few minutes, so a user who just bought DHB might need to wait briefly. In practice this is rarely an issue since the profile data refreshes frequently.

## Implementation Steps

1. Update `use-verify-unlock.ts` to accept `badgeBalance` from the caller (or use the existing profile hook) instead of fetching from the edge function
2. Update `VerifyUnlockButton` to pass the cached balance
3. Delete `supabase/functions/get-badge-balance/index.ts`
4. Remove the `[functions.get-badge-balance]` block from `supabase/config.toml`
5. Delete the deployed edge function

