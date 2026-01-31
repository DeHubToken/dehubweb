
# Fix Login Flow Bug: Connection State Stuck After Rejection

## Problem Summary
When a user clicks a login method (MetaMask, Google, etc.) and then rejects the sign request or cancels, the login modal becomes unresponsive. All buttons remain disabled and clicking other login options doesn't work until the page is refreshed.

## Root Cause Analysis

### Issue 1: Web3Auth State Not Reset After Rejection
When a user rejects a signature or cancels the login flow, Web3Auth's internal state may remain in a "connected" status. Subsequent `connectTo()` calls fail because Web3Auth thinks it's already connected.

### Issue 2: Missing State Cleanup in Error Handlers
In `AuthContext.tsx`, the error handling for user rejections:
- Sets `needsSignature` to `true` and returns early
- Does NOT disconnect/reset Web3Auth
- The modal remains open but Web3Auth is in a broken state

### Issue 3: `activeProvider` State Stuck in LoginModal
When an error occurs, `activeProvider` is set to `null`, but this doesn't help if `isConnecting` remains true from the AuthContext.

## Solution

### 1. Add Web3Auth Disconnect on User Rejection (AuthContext.tsx)
When the user rejects a signature, we need to:
- Disconnect from Web3Auth to reset its internal state
- Reset `isConnecting` to `false`
- Allow the user to try again with any method

### 2. Reset Web3Auth State More Aggressively
After any rejection or cancellation, call `disconnectWeb3Auth()` to ensure the SDK is in a clean state for the next attempt.

### 3. Update Error Handlers in All Connect Methods
Modify `connectWithProvider`, `connectWithEmail`, `connectWithSMS`, and `connectWithWallet` to:
- Disconnect Web3Auth on any error that leaves it in a connected state
- Properly reset all local state

## Technical Implementation

### File: `src/contexts/AuthContext.tsx`

**Changes to `connectWithProvider` function (around lines 337-350):**
```typescript
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : '';
  
  // Check if user rejected the signature
  if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected') || errorMessage.includes('User denied') || errorMessage.includes('User closed')) {
    // Reset Web3Auth state so user can try again
    try {
      await disconnectWeb3Auth();
      resetWeb3AuthState();
    } catch (e) {
      console.warn('[Auth] Cleanup after rejection failed:', e);
    }
    toast.error('Log in was cancelled');
    return;
  }
  
  // For other errors, also clean up
  try {
    await disconnectWeb3Auth();
    resetWeb3AuthState();
  } catch (e) {
    console.warn('[Auth] Cleanup after error failed:', e);
  }
  
  handleConnectionError(error);
}
```

**Apply same pattern to:**
- `connectWithEmail` (lines 375-384)
- `connectWithSMS` (lines 412-421)
- `connectWithWallet` (lines 447-456)

### File: `src/lib/web3auth.ts`

**Update `disconnectWeb3Auth` to be more robust (lines 289-295):**
```typescript
export async function disconnectWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] disconnectWeb3Auth() called");
  try {
    if (web3authInstance?.connected) {
      await web3authInstance.logout();
      console.log("[Web3Auth] ✓ Logged out");
    }
  } catch (e) {
    console.warn("[Web3Auth] Logout error (continuing cleanup):", e);
  }
  // Always reset the instance status tracking
  // This ensures next connection attempt starts fresh
}
```

**Add a safe reset function that can be called after errors:**
```typescript
export async function safeResetAfterError(): Promise<void> {
  console.log("[Web3Auth] Safe reset after error...");
  try {
    if (web3authInstance?.connected) {
      await web3authInstance.logout();
    }
  } catch (e) {
    // Ignore logout errors during reset
  }
  // Reset module state to allow fresh initialization
  resetWeb3AuthState();
}
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add Web3Auth disconnect/reset in all error handlers for connect methods |
| `src/lib/web3auth.ts` | Add `safeResetAfterError()` function for clean recovery from failed connections |

## Testing Steps
1. Open login modal
2. Click "Continue with Google" → Cancel/reject → Verify other buttons still work
3. Click "Connect Wallet" → "MetaMask" → Reject signature → Verify can click other wallets
4. Try switching between Email, SMS, Social, and Wallet options after cancellations
5. Verify successful login still works after multiple cancellations
