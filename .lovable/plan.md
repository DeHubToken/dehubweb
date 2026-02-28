

## Investigation Summary

I traced the full wallet login flow from button click to signature popup. The code path is:

1. `LoginModal.handleWalletConnect()` → sets `wagmiAuthIntent(true)` → calls RainbowKit `connect()`
2. Wagmi connects → `handleWagmiConnect` effect fires in `AuthContext`
3. Effect reaches `completeDeHubAuthWagmi()` → calls `signMessageAsync({ message, account })`

### Root Cause (Most Likely)

In `completeDeHubAuthWagmi` (AuthContext.tsx line 540-542), the `account` parameter is passed as a **lowercased** address:

```js
const authAddress = address.toLowerCase();
// ...
const signature = await signMessageAsync({ 
  message,
  account: authAddress as `0x${string}`  // lowercase!
});
```

Wagmi v2 / viem expect a **checksummed** (mixed-case) address. Passing a non-checksummed address can cause `signMessageAsync` to silently fail — the wallet never receives the sign request, so the user never sees the popup. This may have started failing after a wagmi/viem minor version bump that added stricter address validation.

Additionally, the `completeDeHubAuthWagmi` function has **no try/catch** around `signMessageAsync` — any error thrown here bubbles up to the `handleWagmiConnect` effect's catch block which only logs to console and resets state, with no user-facing error message about the signature failure.

### Plan

**File: `src/contexts/AuthContext.tsx`**

1. **Fix `signMessageAsync` account parameter** (line 540-543): Either remove the `account` parameter entirely (let wagmi use the connected account automatically), or convert to checksummed using `getAddress()` from viem (already imported).

2. **Add error handling around `signMessageAsync`** (line 540): Wrap the signature call in a try/catch that shows a user-facing toast if the wallet rejects or fails to show the popup, and logs the specific error for debugging.

3. **Add defensive logging** before `signMessageAsync`: Log the exact account address format being used and the connector state to help diagnose future issues.

The simplest and most robust fix is to **remove the `account` parameter** from `signMessageAsync` — wagmi already knows which account is connected and will use it automatically. The lowercase address is still used for the message text and the backend auth call, which is correct.

