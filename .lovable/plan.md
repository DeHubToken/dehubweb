

# Simplify Auth Flow: Remove SA Deployment Check, Use `isNewAccount`

## Summary
Remove the smart account deployment step from the **authentication flow only** (since the backend now handles signatures from undeployed smart accounts). Keep all Pimlico/AA infrastructure intact for on-chain transactions (minting, tipping, etc.). Use the new `isNewAccount` response field instead of checking for missing username.

## Changes

### 1. Update `AuthResponse` type
**File:** `src/lib/api/dehub/types.ts`
- Add `isNewAccount?: boolean` to the `result` object in `AuthResponse`

### 2. Remove `ensureSmartAccountDeployed` calls from auth flow only
**File:** `src/contexts/AuthContext.tsx`

- **Remove the `ensureSmartAccountDeployed` function** and its helpers (`isKnownDeployed`, `markDeployedInCache`, `SA_DEPLOYED_CACHE_KEY`, `getCodeDirect`, etc.)
- **`completeDeHubAuthAfterRedirect` (redirect flow, ~line 762):** Remove the `ensureSmartAccountDeployed` call and the "deployment failed" error check. Keep signing logic unchanged.
- **`completeDeHubAuth` (popup flow, ~line 885):** Remove the `ensureSmartAccountDeployed` call inside the `if (isSocial)` block. Keep signing logic unchanged.
- **Username enforcement:** In both `completeDeHubAuth` and `completeDeHubAuthAfterRedirect`, replace `if (!normalizedUser.username)` with `if (authResponse.result?.isNewAccount)` to trigger `setRequiresUsername(true)`
- **Session restore (mount effect):** Keep `if (!normalizedUser.username)` here since we don't have `isNewAccount` during session restore

### 3. No changes to Pimlico or Web3Auth init
**Files NOT touched:**
- `src/lib/web3auth.ts` -- Pimlico config, AA provider, prewarm all stay
- `src/lib/contracts/aa-utils.ts` -- AA transaction helpers stay
- `supabase/functions/get-pimlico-config/index.ts` -- Edge function stays
- `src/components/app/UsernameRequiredModal.tsx` -- No changes needed

## What stays the same
- All Pimlico/AA infrastructure for on-chain transactions
- Web3Auth v10 Modal SDK with Account Abstraction
- ERC-6492 signature handling
- Sign message format (already matches new API spec)
- `POST /api/web/auth` endpoint call (already correct)
- Wagmi external wallet flow
- Session restore logic
- Token storage and expiry

