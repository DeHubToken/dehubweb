

# Login Modal UX Improvements Plan

## Current Situation Analysis

The login modal currently has a good custom UI for initial provider selection, but when users click "Continue with Email" or "Continue with SMS", Web3Auth opens a separate popup window for OTP verification. This creates a jarring UX where users are pulled out of your branded experience.

### Technical Limitation
Web3Auth Modal SDK v10 uses secure MPC (Multi-Party Computation) for key generation during OTP verification. This cryptographic process **requires** their managed iframe/popup to protect the key shares. There is no way to fully embed the OTP entry UI using the Modal SDK.

---

## What We CAN Improve

### 1. Smoother Transition States
Add visual feedback when the popup is opening so users understand what's happening:
- Show a "Verification window opening..." state
- Add instructions like "Check your popup blocker if nothing appears"
- Display a "Waiting for verification..." overlay while the popup is active

### 2. Fallback Detection
Detect if the popup was blocked and show helpful instructions:
- Monitor for popup blockers
- Provide a "Retry" button with guidance
- Show browser-specific help for enabling popups

### 3. Loading States During Verification
Keep the modal visible with a clear waiting state:
- Animated spinner with "Verifying your email..." message
- Timer showing how long verification has been pending
- Cancel button to abort the flow

### 4. Modal Size & Polish
Improve the modal's visual presentation:
- Adjust padding and spacing for better mobile experience
- Add subtle animations for step transitions
- Improve error state styling

### 5. Reduce Steps Where Possible
For social logins (Google, X), the popup opens immediately. For email/SMS, we can:
- Show the email input inline (already done)
- Pre-validate input before triggering the popup
- Remember last used login method

---

## Technical Implementation Details

### File Changes Required

**1. LoginModal.tsx**
- Add new `awaitingVerification` state to show waiting overlay
- Add popup blocker detection logic
- Improve transition animations between steps
- Add "Waiting for verification..." UI with cancel option
- Polish spacing, add subtle entrance animations

**2. AuthContext.tsx**
- Add state tracking for verification-in-progress
- Improve error handling for popup blocked scenarios
- Add timeout detection with user-friendly messaging

### New UI States

```text
+----------------------------------+
|          [DeHub Logo]         X  |
|                                  |
|         Verifying...             |
|                                  |
|     [Animated spinner icon]      |
|                                  |
|   Check the popup window to      |
|   complete verification          |
|                                  |
|   [Cancel]                       |
|                                  |
+----------------------------------+
```

### Popup Blocked Detection

```text
+----------------------------------+
|          [DeHub Logo]         X  |
|                                  |
|    Popup was blocked             |
|                                  |
|   Your browser blocked the       |
|   verification window.           |
|                                  |
|   [How to enable popups]         |
|                                  |
|   [Try Again]                    |
|                                  |
+----------------------------------+
```

---

## Implementation Steps

1. **Add verification-in-progress state** - Track when we're waiting for the Web3Auth popup to complete
2. **Create waiting overlay component** - Shows spinner and helpful text while popup is active
3. **Add popup blocker detection** - Detect when window.open returns null
4. **Improve error recovery** - Add retry buttons and helpful guidance
5. **Polish animations** - Add Framer Motion transitions for smooth step changes
6. **Refine mobile experience** - Ensure the modal works well as a bottom sheet

---

## Summary

While we cannot eliminate the Web3Auth popup entirely (it's a security requirement for their MPC key generation), we can significantly improve the UX by:

- Keeping users informed during the verification process
- Detecting and helping with popup blockers
- Providing clear cancel/retry options
- Adding polished animations and transitions

This creates a much more seamless experience even with the external popup requirement.

