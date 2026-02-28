

## Problem Analysis

Two issues identified:

1. **Username update silently fails**: The `updateProfile` API call at `/api/update_profile` returns a success response even when the username is taken — the API likely just ignores the username field and updates everything else. The `onSuccess` handler shows "Profile updated" toast, but the username didn't actually change. The settings page does NOT check username availability before submitting.

2. **No real-time username availability feedback**: The settings page username input (line 490-496 of SettingsPage.tsx) is a plain `Input` with no availability check. The `UsernameRequiredModal` already has this pattern implemented (debounced check + visual feedback), but SettingsPage doesn't use it.

## Implementation Plan

### 1. Add username availability check to Settings profile tab

- Import `checkUsernameAvailability` from `@/lib/api/dehub`
- Add state: `usernameAvailable`, `usernameError`, `isCheckingUsername`
- Use `useDebouncedValue` hook on the username field
- Run availability check when debounced username changes AND differs from `originalValues.username`
- Skip check if username equals the user's current username

### 2. Show inline feedback on the username input

- Below the username input, show:
  - A green checkmark + "Available" when available
  - A red X + "Username is already taken" when taken
  - A spinner while checking
- Replace the current hint text (`settings.usernameHint`) with dynamic status

### 3. Block save when username is taken

- In `handleSave`, prevent submission if `usernameAvailable === false`
- Disable the Save button when `isCheckingUsername` is true or `usernameAvailable === false`
- Show a toast error if user somehow tries to save with an unavailable username

### Technical Details

- Reuse the same `checkUsernameAvailability` GET endpoint already used in `UsernameRequiredModal`
- Debounce at 300ms (matching existing pattern)
- Only trigger check when username differs from original (avoid checking user's own current username)
- Files to modify: `src/pages/app/SettingsPage.tsx`

