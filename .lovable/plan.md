
# Fix: Email Login Stuck on "Sending Link" on Mobile

## Problem Analysis

The email login flow gets stuck on "Sending link..." on mobile devices even after the user enters the OTP code. This is a known issue with Web3Auth's popup-based authentication on mobile browsers.

### Root Cause

The current implementation uses **popup mode** (`uxMode: "popup"`) by default for email OTP verification. On mobile browsers:
1. When Web3Auth opens a popup/iframe for OTP entry, mobile browsers handle these differently than desktop
2. The popup/iframe may lose its JavaScript context or connection to the parent window
3. The `isConnecting` state never gets reset because the Promise from `connectTo()` never resolves
4. The UI remains stuck showing "Sending link..." with the loading spinner

Evidence from Web3Auth community forums confirms this is a widespread issue affecting mobile users on Android and iOS.

---

## Solution

Implement **redirect mode** for email/SMS passwordless login on mobile devices, which is the recommended approach for mobile browsers according to Web3Auth documentation.

### Strategy: Device-Aware UX Mode

1. **Detect mobile devices** at runtime
2. **Use redirect mode on mobile** - Better mobile compatibility
3. **Use popup mode on desktop** - Better user experience (no page reload)
4. **Handle redirect result** when user returns to the app after OTP verification

---

## Implementation Details

### 1. Update Web3Auth Configuration (src/lib/web3auth.ts)

Add `authConnector` with redirect settings for mobile:

```typescript
import { authConnector, UX_MODE } from "@web3auth/modal";

// Detect mobile device
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

// In Web3Auth constructor, add connectors array:
connectors: [
  authConnector({
    connectorSettings: {
      uxMode: isMobileDevice() ? UX_MODE.REDIRECT : UX_MODE.POPUP,
      redirectUrl: window.location.origin + '/app',
    }
  })
]
```

### 2. Handle Redirect Result on App Load (src/contexts/AuthContext.tsx)

Add logic to detect and handle Web3Auth redirect parameters when the app loads:

```typescript
// In the useEffect for session restoration:
useEffect(() => {
  const init = async () => {
    // Check for Web3Auth redirect result first
    if (hasRedirectResult()) {
      console.log('[Auth] Detected Web3Auth redirect, processing...');
      try {
        const web3authInstance = await initWeb3Auth();
        if (web3authInstance.connected && web3authInstance.provider) {
          await completeDeHubAuth(web3authInstance.provider);
        }
        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('[Auth] Redirect result processing failed:', error);
      }
    }
    // ... rest of existing init logic
  };
  init();
}, []);
```

### 3. Update Mobile Detection Hook (optional enhancement)

Use the existing `useIsMobile` hook from `src/hooks/use-mobile.tsx` or create a utility function in web3auth.ts for server/client detection.

### 4. Add Loading State for Redirect Flow

Since redirect flow reloads the page, show a loading state when processing the redirect:

```typescript
// In AuthContext, add state:
const [isProcessingRedirect, setIsProcessingRedirect] = useState(false);

// When redirect detected:
setIsProcessingRedirect(true);
// ... process redirect
setIsProcessingRedirect(false);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/web3auth.ts` | Add `authConnector` with mobile-aware `uxMode`, add `redirectUrl` configuration |
| `src/contexts/AuthContext.tsx` | Handle redirect result on app load, add redirect processing state |
| `src/components/app/LoginModal.tsx` | Show appropriate message for redirect flow on mobile |

---

## Technical Details

### Web3Auth v10 Redirect Configuration

From the official documentation and community discussions, the correct way to configure redirect in v10:

```typescript
import { Web3Auth, authConnector, UX_MODE, WEB3AUTH_NETWORK } from "@web3auth/modal";

const web3auth = new Web3Auth({
  clientId,
  chains: [chainConfig],
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  connectors: [
    authConnector({
      connectorSettings: {
        uxMode: UX_MODE.REDIRECT,
        redirectUrl: window.location.origin,
      }
    })
  ],
  // ... other config
});
```

### URL Detection for Redirect Result

The existing `hasRedirectResult()` function checks for `b64Params` in the URL hash or search, which indicates a completed OAuth/OTP redirect.

---

## Expected Behavior After Fix

**On Desktop:**
- User enters email → OTP popup appears in same window
- User enters code → Popup closes → Login complete
- No page reload needed

**On Mobile:**
- User enters email → Page redirects to Web3Auth OTP page
- User enters code → Page redirects back to app
- App detects redirect result → Completes authentication
- User is logged in

---

## Testing Checklist

- Test email login on desktop browser (should use popup)
- Test email login on mobile browser (should use redirect)
- Test SMS login on mobile browser
- Verify redirect URL is correctly whitelisted in Web3Auth dashboard
- Test that existing session restoration still works
- Test that direct wallet connections (MetaMask, etc.) still work
