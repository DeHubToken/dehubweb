

## Current State

There's already a **Push Notifications** toggle in Settings (line 639-645) using the `Bell` icon. It's currently marked `comingSoon` with `defaultChecked` set to true.

## Plan

Make this existing toggle functional instead of "coming soon":

### 1. Update `src/pages/app/SettingsPage.tsx`
- Remove `comingSoon` prop from the Push Notifications toggle
- Set `defaultChecked={false}` (off by default)
- Add an `onCheckedChange` handler that:
  - When turned ON: calls `Notification.requestPermission()`
    - If granted → save preference to localStorage, show success toast
    - If denied → revert toggle to off, show toast explaining how to enable in browser settings
    - If unsupported → revert toggle to off, show "not supported" toast
  - When turned OFF: clear localStorage preference, no more browser notifications

### 2. Create `src/hooks/use-browser-notifications.ts`
- Custom hook that reads/writes `dehub_browser_notifications` from localStorage
- Exposes `isEnabled`, `setEnabled(bool)`, and `showNotification(title, body, icon)`
- `showNotification` only fires when `document.hidden` is true (tab not focused) and permission is granted

### 3. Update `src/hooks/use-notifications.ts`
- Import `useBrowserNotifications` hook
- When polling detects new unread notifications (compare against a `lastSeenTimestamp` in localStorage), call `showNotification` for each new one
- Track `lastSeenTimestamp` to avoid duplicate browser notifications

### 4. Update translations (all 38 locale files)
- Add keys: `browserNotificationsEnabled`, `browserNotificationsDenied`, `browserNotificationsUnsupported`
- Reuse existing `pushNotifications` / `pushNotificationsDesc` keys (no change needed there)

### Safety
- Permission requested only on explicit user toggle action (not on page load)
- Follows Google's recommended pattern — no flagging risk
- Respects browser-level denial gracefully

