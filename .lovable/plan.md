

# Fix Login Flow Bug: Modal Freezes After Cancelled OAuth

## Root Cause Analysis

After deep investigation, the issue is that when a user cancels a login attempt (e.g., closes the Google OAuth popup), the Web3Auth SDK enters an inconsistent internal state. The current error recovery doesn't properly clean up because:

1. **Incomplete error message detection**: Web3Auth throws various error messages when OAuth is cancelled that aren't being caught (e.g., "popup_closed_by_user", "popup closed", "Failed to connect with wallet")

2. **Fire-and-forget logout**: `resetWeb3AuthState()` only calls `logout()` if `connected === true`, but when OAuth fails mid-flow, the instance isn't "connected" yet - leaving internal state, iframes, and promises dangling

3. **No forced cleanup**: The SDK may have open iframes, modal overlays, or pending event listeners that block subsequent connection attempts

## Solution

### Part 1: Expand Error Message Detection

Update the catch block patterns to detect more cancellation scenarios:

```typescript
const isCancellation = 
  errorMessage.includes('user rejected') ||
  errorMessage.includes('User rejected') ||
  errorMessage.includes('User denied') ||
  errorMessage.includes('User closed') ||
  errorMessage.includes('cancelled') ||
  errorMessage.includes('popup_closed') ||
  errorMessage.includes('popup closed') ||
  errorMessage.includes('closed by user') ||
  errorMessage.includes('user canceled') ||
  errorMessage.includes('window closed');
```

### Part 2: Forceful Web3Auth Cleanup

Create a more aggressive reset function that cleans up regardless of connection state:

```typescript
export async function forceCleanupWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] Force cleanup after error...");
  
  // Try to logout regardless of connection state
  if (web3authInstance) {
    try {
      // Try logout even if not connected - clears internal state
      await web3authInstance.logout();
    } catch (e) {
      // Expected to fail if not connected, that's fine
    }
  }
  
  // Clean up any leftover Web3Auth iframes/modals from the DOM
  document.querySelectorAll('iframe[title*="web3auth"], iframe[id*="web3auth"]').forEach(el => el.remove());
  document.querySelectorAll('[class*="w3a-modal"], [class*="web3auth"]').forEach(el => el.remove());
  
  // Reset module variables
  web3authInstance = null;
  isInitializing = false;
  initPromise = null;
  
  console.log("[Web3Auth] ✓ Force cleanup complete");
}
```

### Part 3: Update AuthContext Error Handlers

Replace `safeResetAfterError()` calls with `forceCleanupWeb3Auth()` in all error handlers:

**File: src/contexts/AuthContext.tsx**

In each connect method (`connectWithProvider`, `connectWithEmail`, `connectWithSMS`, `connectWithWallet`), update the catch block:

```typescript
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  
  // Expanded cancellation detection
  const isCancellation = 
    errorMessage.includes('user rejected') ||
    errorMessage.includes('user denied') ||
    errorMessage.includes('user closed') ||
    errorMessage.includes('cancelled') ||
    errorMessage.includes('canceled') ||
    errorMessage.includes('popup_closed') ||
    errorMessage.includes('popup closed') ||
    errorMessage.includes('closed by user') ||
    errorMessage.includes('window closed') ||
    errorMessage.includes('aborted');
  
  // Always force cleanup after any error
  try {
    await forceCleanupWeb3Auth();
  } catch (e) {
    console.warn('[Auth] Cleanup failed:', e);
  }
  
  if (isCancellation) {
    toast.error('Log in was cancelled');
    return; // Don't throw, just return silently
  }
  
  // For non-cancellation errors, show error toast but don't throw
  // (throwing prevents finally block from resetting isConnecting properly)
  handleConnectionError(error);
}
```

### Part 4: Prevent Error Re-throwing

The `handleConnectionError` function currently throws, which can cause issues. Change it to NOT throw:

```typescript
const handleConnectionError = (error: unknown) => {
  console.error('[Auth] Connection failed:', error);
  
  const errorMessage = error instanceof Error ? error.message : 'Connection failed';
  let userFriendlyMessage = 'Connection failed. Please try again.';
  
  // ... existing message mapping logic ...
  
  toast.error(userFriendlyMessage);
  // Remove: throw new Error(userFriendlyMessage);
};
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/web3auth.ts` | Add `forceCleanupWeb3Auth()` function with DOM cleanup |
| `src/contexts/AuthContext.tsx` | Expand error detection, use force cleanup, remove throw from handleConnectionError |

## Testing Checklist

1. Click "Continue with Google" → Close the popup → Try clicking "Continue with X" → Should work
2. Click "Connect Wallet" → "MetaMask" → Reject signature → Click Google → Should work
3. Click Google → Cancel → Click Email → Enter email → Should work
4. Repeat cancellations multiple times → Modal should remain responsive
5. Successfully complete login after previous cancellations → Should work

