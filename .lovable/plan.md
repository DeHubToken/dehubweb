

# Fix: Login Modal Should Always Be Closable

## Problem

The login modal occasionally becomes "corrupted" and unclosable due to Web3Auth's wallet iframe overlay:

- Web3Auth creates a fullscreen iframe with `z-index: 99999`
- This iframe can get stuck in an active state after failed/cancelled authentication
- The iframe blocks clicks on the modal's close button
- The `handleClose` function currently prevents closing while `isConnecting` is true

## Solution

Make the modal always closable regardless of connection state, and add cleanup for stuck Web3Auth states.

---

## Changes

### 1. LoginModal.tsx - Always Allow Close

**File:** `src/components/app/LoginModal.tsx`

Remove the `isConnecting` guard from `handleClose`:

```typescript
// BEFORE (line 51-61)
const handleClose = () => {
  if (!isConnecting) {  // ← This blocks closing
    setStep('main');
    // ...
    onOpenChange(false);
  }
};

// AFTER
const handleClose = () => {
  // Always allow closing - user should never be trapped
  setStep('main');
  setEmail('');
  setPhone('');
  setEmailError('');
  setPhoneError('');
  setActiveProvider(null);
  onOpenChange(false);
};
```

Also remove `disabled={isConnecting}` from the close button (line 366):

```typescript
// BEFORE
<button
  onClick={handleClose}
  disabled={isConnecting}  // ← Remove this
  className="..."
>

// AFTER  
<button
  onClick={handleClose}
  className="..."
>
```

### 2. AuthContext.tsx - Cancel Connection on Modal Close

**File:** `src/contexts/AuthContext.tsx`

Add a flag to abort in-progress connections when modal closes:

```typescript
// Add ref to track if connection should be aborted
const connectionAbortedRef = useRef(false);

// Update closeLoginModal to signal abort
const closeLoginModal = useCallback(() => {
  connectionAbortedRef.current = true;
  setIsConnecting(false);
  setIsLoginModalOpen(false);
}, []);

// In connection methods, check abort flag before completing
const connectWithProvider = useCallback(async (provider: SocialProvider) => {
  connectionAbortedRef.current = false;
  setIsConnecting(true);
  
  try {
    // ... connection logic ...
    
    // Check if user closed modal during connection
    if (connectionAbortedRef.current) {
      console.log('[Auth] Connection aborted by user');
      return;
    }
    
    await completeDeHubAuth(web3authProvider);
    // ...
  } catch (error) {
    // ... error handling ...
  } finally {
    setIsConnecting(false);
  }
}, [closeLoginModal]);
```

### 3. Add Web3Auth Cleanup on Close

**File:** `src/contexts/AuthContext.tsx`

When the modal is force-closed, cleanup any stuck Web3Auth state:

```typescript
import { resetWeb3AuthState } from '@/lib/web3auth';

const closeLoginModal = useCallback(() => {
  connectionAbortedRef.current = true;
  setIsConnecting(false);
  setIsLoginModalOpen(false);
  
  // If we were connecting, reset Web3Auth to clear stuck iframes
  if (isConnecting) {
    console.log('[Auth] Force closing - resetting Web3Auth state');
    // Small delay to let state update first
    setTimeout(() => {
      resetWeb3AuthState();
    }, 100);
  }
}, [isConnecting]);
```

### 4. Ensure Close Button Has Higher z-index

**File:** `src/components/app/LoginModal.tsx`

Add explicit z-index to the close button to ensure it's above any overlays:

```typescript
<button
  onClick={handleClose}
  className="absolute right-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white z-[100000]"
>
  <X className="w-5 h-5" />
</button>
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/app/LoginModal.tsx` | Remove `isConnecting` guard from close, add high z-index to close button |
| `src/contexts/AuthContext.tsx` | Add abort mechanism, cleanup Web3Auth on force close |

## Result

- User can **always** close the login modal with the X button
- Closing during auth will abort the connection attempt
- Stuck Web3Auth iframes are cleaned up
- Close button has z-index higher than Web3Auth's overlay (100000 > 99999)

