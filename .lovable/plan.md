

# Fix: `isWeb3Auth` Incorrectly Returns `true` for External Wallets

## Root Cause
The console log confirms: `isWeb3Auth: true` even though Bill is using an external wallet. This means the code never reaches the wagmi `sendTransaction` path and instead sends through the Web3Auth provider (which routes to a public RPC that doesn't hold Bill's keys).

The bug is in `getWeb3AuthProvider()` in `src/lib/web3auth.ts`:

```typescript
export function getWeb3AuthProvider() {
  return web3authInstance?.provider || null;
}
```

Web3Auth's `provider` property is non-null as soon as `init()` completes (status "ready"), **even if the user never logged in through Web3Auth**. So for Bill (external wallet user), Web3Auth was initialized in the background, its `.provider` is truthy, and `getActiveProvider()` incorrectly picks the Web3Auth path.

## Fix

**File: `src/lib/web3auth.ts`** -- Update `getWeb3AuthProvider` to also check `.connected`:

```typescript
export function getWeb3AuthProvider() {
  // Only return provider if user actually authenticated through Web3Auth
  // .provider exists after init() even for non-Web3Auth users
  if (web3authInstance?.connected && web3authInstance.provider) {
    return web3authInstance.provider;
  }
  return null;
}
```

This ensures `isWeb3Auth` is only `true` when the user actually logged in via social login (Web3Auth), not just because Web3Auth was initialized.

No other files need changes -- `getActiveProvider()` in `aa-utils.ts` already branches correctly based on the `isWeb3Auth` flag. This one-line fix makes the flag accurate.

