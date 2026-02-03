

## Seamless Re-Authentication (No Full Sign-In Required)

Instead of prompting users to click "Sign in" and go through the login modal, we can **automatically request a new signature** using the still-connected Web3Auth provider and refresh the token seamlessly.

---

### Current vs Improved Flow

**Current Implementation:**
1. API call fails (401/403)
2. Toast: "Session expired" + "Sign in" button
3. User clicks → Full login modal opens
4. User selects provider again → Signs message → Gets new token

**Improved Implementation:**
1. API call fails (401/403)
2. Toast: "Session expired" + "Refresh" button (or auto-refresh)
3. App detects Web3Auth is still connected
4. Automatically requests new signature from existing provider
5. Gets fresh JWT → User continues seamlessly

---

### Technical Implementation

#### 1. Add Re-Signature Function to AuthContext

Create a new `refreshSession` function that:
- Checks if Web3Auth is still connected
- Gets the existing provider
- Requests a new signature
- Calls `authenticateWallet()` to get fresh JWT
- Updates the stored token

```typescript
// In AuthContext.tsx
const refreshSession = useCallback(async (): Promise<boolean> => {
  const web3authInstance = await getOrInitWeb3Auth();
  
  // Check if still connected to wallet
  if (!web3authInstance.connected || !web3authInstance.provider) {
    console.log('[Auth] Not connected, cannot refresh - need full sign in');
    return false;
  }
  
  try {
    // Re-run the signature flow with existing provider
    await completeDeHubAuth(web3authInstance.provider);
    return true;
  } catch (error) {
    console.error('[Auth] Session refresh failed:', error);
    return false;
  }
}, []);
```

#### 2. Update useReauthHandler to Try Seamless Refresh First

```typescript
export function useReauthHandler() {
  const { openLoginModal, refreshSession } = useAuth();

  const handleApiError = async (error: unknown, fallbackMessage: string): Promise<boolean> => {
    if (error instanceof AuthenticationError) {
      // Try seamless refresh first
      const toastId = toast.loading('Refreshing session...');
      
      const refreshed = await refreshSession();
      toast.dismiss(toastId);
      
      if (refreshed) {
        toast.success('Session refreshed');
        return true; // Caller can retry the action
      }
      
      // Fallback to full sign-in if refresh fails
      toast.error('Session expired', {
        description: 'Please sign in again to continue',
        action: {
          label: 'Sign in',
          onClick: openLoginModal,
        },
        duration: 8000,
      });
      return true;
    }
    
    toast.error(fallbackMessage);
    return false;
  };

  return { handleApiError };
}
```

#### 3. Update Components to Retry After Successful Refresh

Components can check if the session was refreshed and automatically retry the action:

```typescript
const handleFollow = async () => {
  try {
    await followUser(profile.walletAddress);
    toast.success(`Following ${profile.name}`);
  } catch (error) {
    setFollowStatus(false);
    const wasAuthError = await handleApiError(error, 'Failed to follow');
    
    // If session was refreshed, the user can click follow again
    // (or we could auto-retry here)
  }
};
```

---

### Files to Modify

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `refreshSession` function, export it in context |
| `src/hooks/use-reauth-handler.ts` | Call `refreshSession()` before showing "Sign in" prompt |

---

### User Experience

**Before**: Token expires → Toast with "Sign in" → Full modal flow → Re-authenticate from scratch

**After**: Token expires → "Refreshing session..." → Signature popup → Done! (≈2-3 seconds)

If the wallet is disconnected (user closed browser, cleared session, etc.), it falls back to the full sign-in flow.

