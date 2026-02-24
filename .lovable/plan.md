

## Plan: Add "Coming soon" Toast to Non-Functional Settings

After auditing every setting against the DeHub API, here's the breakdown:

### Settings with DeHub API support (already working or can be wired)
- **Profile tab**: Display name, username, bio, avatar, cover, social links — all via `updateProfile`
- **Privacy > Private Account** — `isPrivate` field
- **Privacy > Follow Visibility** — `hideFollowers` + customs
- **Privacy > Default Post Visibility** — customs + `batch_token_visibility`
- **Privacy > Blocked Users** — `/api/block`
- **Privacy > Follow Requests** — `/api/follow-requests`
- **Notifications tab**: Push preferences (likes, comments, follows, DMs) — `/api/push/preferences` exists in `push.ts`
- **Appearance > Language** — local, works
- **Appearance > Coin Placement** — local, works
- **Appearance > Theme (System only)** — local, works (others already show "Coming soon")

### Settings WITHOUT API support → need "Coming soon" toast
These toggles/buttons currently do nothing when interacted with:

**Privacy tab:**
1. Public Profile toggle (line 737-742) — static `defaultChecked`
2. Show Activity Status toggle (line 775-780) — no handler
3. Search Engine Indexing toggle (line 781-786) — no handler
4. Who Can Message (in Privacy) select (line 830-840) — local state only
5. Two-Factor Auth button (line 855-857) — no handler
6. Extract Data button (line 873-880) — fake toast
7. Geo-Blocking selector (line 892) — local state only

**Notifications tab:**
8. Email Notifications toggle (line 596-601) — no handler
9. Push Notifications toggle (line 602-607) — no handler  
10. Likes toggle (line 615-620) — no handler
11. Comments toggle (line 621-626) — no handler
12. New Followers toggle (line 627-632) — no handler
13. Direct Messages toggle (line 633-638) — no handler
14. Quiet Hours toggle (line 645-649) — no handler

**Appearance tab:**
15. Feed Layout select (line 1071-1079) — local state only
16. Compact Mode toggle (line 1081-1086) — no handler
17. Auto-Play toggle (line 1093-1098) — no handler
18. Show Animations toggle (line 1100-1104) — no handler

**Content tab:**
19. Default Post Visibility (duplicate, line 1176-1185) — local state only
20. Auto-Save Drafts toggle (line 1187-1192) — no handler
21. Filter Explicit toggle (line 1200-1205) — no handler
22. Show Sensitive toggle (line 1206-1210) — no handler
23. Content Warnings toggle (line 1211-1216) — no handler
24. Show Reposts toggle (line 1223-1228) — no handler

**Messages tab:**
25. DM Access select (line 1449-1458) — local state only
26. Message Notifications toggle (line 1472-1477) — no handler
27. Read Receipts toggle (line 1478-1483) — no handler
28. E2E Encryption toggle (line 1484-1489) — no handler
29. Filter Message Requests toggle (line 1490-1494) — no handler
30. Storage bar (line 1501-1516) — hardcoded 42%
31. Archived Chats button (line 1523-1526) — no handler
32. Export Chats button (line 1527-1530) — no handler

### Implementation

**File: `src/pages/app/SettingsPage.tsx`**

1. **Update `SettingToggle`** to accept an optional `comingSoon` prop. When `comingSoon` is true, the `onCheckedChange` will show `toast.info('Coming soon')` and prevent the toggle from changing.

2. **Add `comingSoon` to every non-functional toggle** listed above (items 1-32). This keeps the UI intact but provides honest feedback.

3. **For non-functional selects** (Feed Layout, Who Can Message in Privacy, DM Access in Messages, Content Post Visibility), wrap `onValueChange` to show "Coming soon" toast and revert to current value.

4. **For non-functional buttons** (2FA Enable, Extract Data Download, Archived Chats, Export Chats), change `onClick` to show `toast.info('Coming soon')`.

5. **Special case — Notification toggles**: The push preferences API (`/api/push/preferences`) exists and supports `likes`, `comments`, `follows`, `directMessages`. These could be wired up now, but since the toggles currently have no state management, we'll mark them "Coming soon" for consistency and wire them in a follow-up.

### Technical detail
- The `SettingToggle` component will be updated to intercept the switch interaction when `comingSoon={true}`, showing the toast and keeping the toggle at its default position
- For `SettingDrawerSelect` wrappers, the `onValueChange` callbacks will be wrapped to show the toast and not update state
- No API changes needed — this is purely a UX honesty pass

