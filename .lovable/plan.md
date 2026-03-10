

## Problem

After logout and re-login, clicking MetaMask throws `ConnectorAlreadyConnectedError`. The existing guard (line 994-1000) only checks `getAccount(wagmiConfig).isConnected`, which returns `false` after disconnect. But the **individual connector** (`metaMaskSDK`) still considers itself connected internally. So the guard is bypassed and `connectAsync` fails.

## Fix

In `src/contexts/AuthContext.tsx`, in the `connectWithWallet` function (~line 991-1003):

1. **Disconnect the specific connector** before calling `connectAsync`, not just check the global account state. Use `wagmiDisconnect({ connector })` to target the specific connector that's stale.

2. **Catch `ConnectorAlreadyConnectedError` specifically** — if it occurs, disconnect that connector, wait briefly, then retry `connectAsync` once.

The updated logic:

```typescript
// Before connectAsync, always disconnect the target connector
// to clear any stale internal state from previous sessions
try {
  await connector.disconnect();
} catch { /* ignore if not connected */ }
await new Promise(r => setTimeout(r, 100));

try {
  await connectAsync({ connector });
} catch (retryErr: any) {
  if (retryErr?.name === 'ConnectorAlreadyConnectedError') {
    // Force full disconnect and retry once
    wagmiDisconnect();
    clearWagmiStorage();
    await new Promise(r => setTimeout(r, 200));
    await connectAsync({ connector });
  } else {
    throw retryErr;
  }
}
```

This replaces the current `getAccount` check (lines 991-1003) with a more robust approach that handles the connector-level stale state.

## File to modify
- `src/contexts/AuthContext.tsx` (lines ~991-1003)

