

# Improve Google Login Toast Flow

## Problem

When logging in with Google, the user clicks the button, a Google popup opens, and nothing happens in the app until the popup closes. Then all the progress toasts ("Getting your account...", "Please sign the message...", "Verifying with DeHub...", "Welcome back!") flash through rapidly at the end. The user has no feedback during the waiting period.

## Solution

Add progressive toast notifications at each stage of the login flow so the user sees real-time feedback:

1. **Immediately on click**: Show "Connecting to Google..." toast (before the popup even opens)
2. **After Google popup returns**: Update to "Setting up your account..." 
3. **During signature**: Update to "Signing in..."
4. **During API verification**: Update to "Verifying..."
5. **On success**: Show "Welcome back!" or "Successfully logged in!"

## Technical Changes

### 1. `src/contexts/AuthContext.tsx` - `connectWithProvider` (around line 843)

Add an immediate toast right when the user clicks Google (before `connectToSocialProvider` is called):

```typescript
const connectWithProvider = async (provider: SocialProvider, isRetry = false) => {
    setIsConnecting(true);
    setActiveProvider(provider);
    setConnectionSource('web3auth');
    localStorage.setItem('dehub_connection_source', 'web3auth');

    // Show immediate feedback
    toast.loading(`Connecting to ${provider === 'google' ? 'Google' : provider === 'twitter' ? 'X' : provider}...`, { id: 'auth-popup' });

    try { ...
```

### 2. `src/contexts/AuthContext.tsx` - `completeDeHubAuth` (around line 698-818)

Update the toast progression to flow naturally from the existing "Connecting to Google..." toast:

- Change line ~705 from `toast.loading('Getting your account...')` to `toast.loading('Setting up your account...')` — this replaces the "Connecting to Google..." toast since it uses the same `id: 'auth-popup'`
- Keep the signature toast at line ~737: "Signing in..." (shorter, cleaner)  
- Keep the verification toast at line ~786: "Almost there..." (friendlier)
- Keep the success toast at line ~812

### 3. `src/contexts/AuthContext.tsx` - Dismiss toast on cancellation

In the `connectWithProvider` catch block (around line 857), dismiss the loading toast if the user cancels or if there's an error, so it doesn't linger:

```typescript
} catch (error: any) {
    // Dismiss any lingering loading toast
    toast.dismiss('auth-popup');
    ...
```

Also dismiss on retry path (line ~865) so the "Retrying..." toast replaces cleanly.

## Result

The user will see a smooth progression:
- Click Google -> "Connecting to Google..." (instant)
- Google popup opens and user authenticates
- Popup closes -> "Setting up your account..." 
- Auto-sign -> "Signing in..."
- API call -> "Almost there..."  
- Done -> "Welcome back!"

No more dead silence followed by a rapid toast avalanche.

