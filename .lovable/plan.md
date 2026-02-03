

## Re-Sign Prompt on Authentication Failure

When an authenticated API call fails due to an expired or invalid token, instead of silently failing, the app will prompt the user to re-authenticate.

---

### Problem Summary

Currently, when an API call like `followUser` fails due to authentication issues:
1. The error is caught in the component (e.g., `ProfilePage.tsx`)
2. A generic "Failed to follow" toast is shown
3. The user has no clear path to fix the issue without manually logging out and back in

---

### Solution Overview

Implement a **re-authentication prompt system** that:
1. Detects when an API call fails due to authentication (401/403 or token issues)
2. Prompts the user with an actionable toast to re-sign
3. Opens the login modal when the user clicks to re-authenticate

---

### Technical Implementation

#### 1. Add Auth Error Detection in API Layer

Update `src/lib/api/dehub.ts` to export a custom error class for authentication failures:

```typescript
// New class to identify auth-specific errors
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
```

Update `apiCall()` to detect 401/403 responses and throw `AuthenticationError`:

```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  
  // Detect auth failures (401 Unauthorized, 403 Forbidden, or auth-related messages)
  if (response.status === 401 || response.status === 403 || 
      errorData.message?.toLowerCase().includes('unauthorized') ||
      errorData.message?.toLowerCase().includes('invalid token')) {
    // Clear stale session
    clearAuthSession();
    throw new AuthenticationError('Session expired. Please sign in again.');
  }
  
  throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
}
```

---

#### 2. Create a Re-Auth Hook

Create `src/hooks/use-reauth-handler.ts` to provide a reusable handler for components:

```typescript
import { useAuth } from '@/contexts/AuthContext';
import { AuthenticationError } from '@/lib/api/dehub';
import { toast } from 'sonner';

export function useReauthHandler() {
  const { openLoginModal } = useAuth();

  const handleApiError = (error: unknown, fallbackMessage: string) => {
    if (error instanceof AuthenticationError) {
      toast.error('Session expired', {
        description: 'Please sign in again to continue',
        action: {
          label: 'Sign in',
          onClick: openLoginModal,
        },
        duration: 8000,
      });
      return true; // Indicates auth error was handled
    }
    
    // Not an auth error, show fallback message
    toast.error(fallbackMessage);
    return false;
  };

  return { handleApiError };
}
```

---

#### 3. Update Components to Use the Handler

Update `src/pages/app/ProfilePage.tsx` follow handlers:

```typescript
const { handleApiError } = useReauthHandler();

const handleFollow = async () => {
  // ... existing validation ...
  
  try {
    await followUser(profile.walletAddress);
    toast.success(`Following ${profile.name}`);
  } catch (error) {
    setFollowStatus(false); // Revert optimistic update
    handleApiError(error, 'Failed to follow. Please try again.');
  } finally {
    setIsFollowLoading(false);
  }
};
```

Apply similar updates to:
- `src/components/app/WhoToFollow.tsx`
- `src/components/app/profile/FollowersListDrawer.tsx`
- Any other components that call authenticated API endpoints

---

#### 4. Fix the Stale Token Caching Issue

While implementing re-auth prompts, also fix the root cause in `src/lib/api/dehub.ts`:

```typescript
// Change getAuthToken to always read fresh from localStorage
export const getAuthToken = (): string | null => {
  return localStorage.getItem("dehub_token");
};
```

Remove the module-level `authToken` variable caching that was causing the original stale token issue.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/api/dehub.ts` | Add `AuthenticationError` class, update `apiCall()` to detect auth failures, fix token caching |
| `src/hooks/use-reauth-handler.ts` | New file - reusable hook for handling auth errors with re-sign prompts |
| `src/hooks/index.ts` | Export the new hook |
| `src/pages/app/ProfilePage.tsx` | Use `useReauthHandler` for follow/unfollow errors |
| `src/components/app/WhoToFollow.tsx` | Use `useReauthHandler` for follow errors |
| `src/components/app/profile/FollowersListDrawer.tsx` | Use `useReauthHandler` for follow/unfollow errors |

---

### User Experience

**Before**: Follow fails → Generic "Failed to follow" toast → User confused

**After**: Follow fails due to auth → Toast with "Session expired" message + "Sign in" button → User clicks → Login modal opens → User re-authenticates → Can retry action

