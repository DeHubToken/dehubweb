

## Problem

The `useTotalUnreadCount()` hook in `use-messages.ts` already computes total unread DM count, but it's not connected to the Messages nav item in the sidebar or mobile header. Only Notifications and Communities have unread badges.

## Fix

### 1. DesktopSidebar — wire up DM unread count
- Import `useTotalUnreadCount` from hooks
- Add `const dmUnread = useTotalUnreadCount()` 
- In the nav item loop, detect `isMessagesItem = item.label === 'Messages'` (the variable `isAfterMessages` already does this)
- Pass `notificationCount` for Messages: update the ternary to include `isAfterMessages ? dmUnread : undefined`

### 2. MobileHeader / MobileBottomBar — wire up DM unread count
- Same pattern: import `useTotalUnreadCount`, pass it to the Messages nav item badge

### Files to edit
- `src/components/app/navigation/DesktopSidebar.tsx` — add import + pass `notificationCount` for Messages
- Mobile nav components (MobileHeader, bottom bar) — same treatment

This is a minimal change — 2-3 lines per file, no new hooks or DB changes needed.

