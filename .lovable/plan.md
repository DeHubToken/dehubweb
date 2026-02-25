

## Investigation: Wallet Connection Fails After Repeated Use & Unnecessary Re-authentication

### Problems Identified

There are **3 distinct issues** causing wallet users to get kicked out and fail to reconnect:

---

### Problem 1: `clearStaleWagmiState()` nukes wagmi state on every page load

In `src/lib/wagmi.ts` (lines 26-46), `clearStaleWagmiState()` runs synchronously at module import time. It checks if the DeHub token is valid AND if `dehub_connection_source === 'wagmi'`. If the token has expired (24h), it **wipes all wagmi/WalletConnect localStorage keys** — including the keys RainbowKit needs to remember which connector was used and re-establish the connection.

This means: after 24 hours, the next page load destroys the connector state. When the user clicks "Connect Wallet" again, RainbowKit/wagmi can't find the previous session, and the WalletConnect relay may have stale pairing data that conflicts with a fresh connection attempt. The second signature popup never appears because the connector is in a broken half-state.

**Fix**: Only clear wagmi state during an explicit `disconnect()` call, not proactively on page load. If the DeHub token is expired but wagmi can still connect, let it connect — the `handleWagmiConnect` effect will prompt for a fresh signature. Remove the `clearStaleWagmiState()` call from module scope.

---

### Problem 2: `handleWagmiConnect` silently disconnects returning users without valid tokens

In `AuthContext.tsx` (lines 378-392), when wagmi auto-reconnects from localStorage but there's no valid DeHub token AND no `wagmiAuthIntentRef`, the code **silently disconnects wagmi and clears storage**. This is the "kicking users out" behavior.

The intent was to prevent unwanted signature popups on page load. But it's too aggressive — it destroys the wagmi connection state that would have been needed when the user clicks "Connect Wallet" moments later. After this cleanup, clicking the wallet button tries to establish a fresh connection, but the old WalletConnect pairing data is partially cleared, causing the relay handshake to fail silently.

**Fix**: Don't disconnect wagmi when it auto-reconnects without user intent. Instead, just skip the DeHub auth flow. Keep wagmi connected but unauthenticated. When the user clicks "Connect Wallet", the `wagmiAuthIntentRef` flag will be set, and the existing wagmi connection can be reused — going straight to the signature step without needing a fresh wallet connection.

---

### Problem 3: `refreshSession` is a no-op — it never actually refreshes

In `AuthContext.tsx` (lines 1042-1048), `refreshSession` just checks if the token exists and isn't expired. It never calls the DeHub API to get a new token. So when the `useReauthHandler` hook calls `refreshSession()` after a 401, it always returns `false` for expired tokens, forcing a full re-login.

**Fix**: Implement actual session refresh in `refreshSession`. For wagmi users, if wagmi is still connected, request a new signature and call `authenticateWallet` to get a fresh token — all without showing the login modal. For Web3Auth users, if Web3Auth is still connected, do the same via the provider. This is the "sign again for re-auth" behavior you want.

---

### Implementation Plan

#### File 1: `src/lib/wagmi.ts`
- **Remove** the `clearStaleWagmiState()` function call at module scope (lines 44)
- Keep the `clearWagmiStorage()` export for explicit disconnect use

#### File 2: `src/contexts/AuthContext.tsx`

**Change A** — Don't disconnect wagmi on auto-reconnect without intent (lines 378-392):
```typescript
// BEFORE: Aggressively disconnects
if (!hasUserIntent && !isReturningWagmiUser) {
  clearWagmiStorage();
  wagmiDisconnect();
  return;
}

// AFTER: Just skip auth, keep wagmi connected for when user clicks "Connect"
if (!hasUserIntent && !isReturningWagmiUser) {
  console.log('[Auth] Wagmi auto-reconnected without intent, keeping connection alive');
  return; // Don't disconnect — user can click "Connect Wallet" to trigger auth
}
```

**Change B** — Implement real `refreshSession` (lines 1042-1048):
```typescript
const refreshSession = async (): Promise<boolean> => {
  // If token is still valid, no refresh needed
  const token = getAuthToken();
  if (token && !isTokenExpired()) return true;

  // For wagmi users: if wagmi is still connected, re-sign silently
  if (connectionSource === 'wagmi' && isWagmiConnected && wagmiAddress) {
    try {
      await completeDeHubAuthWagmi(wagmiAddress);
      return true;
    } catch (e) {
      console.warn('[Auth] Silent wagmi re-auth failed:', e);
      return false;
    }
  }

  // For Web3Auth users: if Web3Auth is still connected, re-sign
  if (connectionSource === 'web3auth') {
    try {
      const w3a = await getOrInitWeb3Auth();
      if (w3a.connected && w3a.provider) {
        await completeDeHubAuth(w3a.provider);
        return true;
      }
    } catch (e) {
      console.warn('[Auth] Silent Web3Auth re-auth failed:', e);
      return false;
    }
  }

  return false;
};
```

**Change C** — Don't clear wagmi storage in the token-expired branch on mount (line 386-387):
Remove the `clearWagmiStorage()` call from the "no valid token found" branch so the connector state survives for the next connect attempt.

#### File 3: `src/lib/api/dehub/core.ts`
- **Remove** the `clearAuthSession()` call from the 401/403 handler (lines 119, 124). Instead, throw `AuthenticationError` without wiping session — let the `useReauthHandler` attempt a refresh first. Currently it wipes tokens *before* the reauth handler even gets a chance to try.

### Summary

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Wallet stops connecting after a few uses | `clearStaleWagmiState()` destroys connector state on page load | Remove proactive cleanup; only clear on explicit disconnect |
| Users get kicked out unnecessarily | `handleWagmiConnect` disconnects wagmi when no DeHub token exists | Keep wagmi connected, just skip DeHub auth until user clicks Connect |
| Can't seamlessly re-auth | `refreshSession` is a no-op; 401 handler wipes tokens immediately | Implement real re-sign flow; don't clear tokens before reauth attempt |

### Technical Details

- The wagmi connector state stored in localStorage includes WalletConnect pairing topics, relay session data, and connector IDs. Clearing these mid-session breaks the relay handshake for the next connection attempt.
- RainbowKit's `WalletButton.Custom` calls wagmi `connectAsync` internally. If previous pairing data is partially cleared, the WalletConnect relay can't establish a new session, causing the signature popup to never appear.
- The `completeDeHubAuthWagmi` function already handles the full sign → authenticate → save flow. Calling it from `refreshSession` gives users seamless re-auth with just a wallet signature prompt — no need to go through the full connection flow again.

