

# Fix: Silent account switch during session refresh

## Root Cause

When you edit a post and the API returns a 401 (token expired), the `useReauthHandler` calls `refreshSession()`, which calls `completeDeHubAuth(w3a.provider)` to silently re-sign.

The problem: `completeDeHubAuth` gets the Smart Account address from Web3Auth's AA provider and authenticates with whatever address comes back — **without checking if it matches the currently logged-in wallet**. If Web3Auth's internal session state has drifted (provider reconnected with different credentials, stale cache, session rotated), a completely different address can come back, and the code blindly:

1. Calls `authenticateWallet()` with the new address
2. Overwrites `localStorage` (`dehub_wallet`, `dehub_user`, `dehub_token`)
3. Overwrites React state (`setUser`, `setWalletAddress`)

Result: you're silently logged into a different account with no warning.

## Fix

Add an **address guard** in both `completeDeHubAuth` and `completeDeHubAuthWagmi`. When there's already an active session (`walletAddress` is set), verify the signing address matches the current wallet before calling `authenticateWallet`. If the address doesn't match, throw an error — forcing a full logout instead of a silent switch.

### Changes in `src/contexts/AuthContext.tsx`:

**1. `completeDeHubAuthWagmi` (line ~564)** — Add guard after signature:
```typescript
// Before calling authenticateWallet, verify address hasn't changed
if (walletAddress && walletAddress.toLowerCase() !== authAddress.toLowerCase()) {
  console.error('[Auth] Address mismatch during refresh!', { expected: walletAddress, got: authAddress });
  throw new Error('Wallet address changed during session refresh. Please sign in again.');
}
```

**2. `completeDeHubAuth` (line ~706)** — Add guard before each `authenticateWallet` call for both the Smart Account path and the external wallet path. When the resolved signing address differs from the current `walletAddress`, abort instead of proceeding.

**3. `completeDeHubAuthAfterRedirect` (line ~629)** — Same guard for the redirect flow.

**4. `refreshSession` (line ~1086)** — Add a safety net: capture `walletAddress` before the refresh call. If it changed after, revert the state and return `false`.

This is a ~20-line change across 4 locations in `AuthContext.tsx`, all adding the same pattern: "if address changed, abort".

