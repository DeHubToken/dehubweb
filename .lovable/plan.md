
# Fix Notification Navigation for All Types

## Summary
Update the Notifications page so clicking on each notification type navigates to the correct destination. Currently, the profile links use the wrong URL pattern.

## What's Being Fixed

| Notification Type | Current (Wrong) | Should Be |
|------------------|-----------------|-----------|
| Follow | `/app/profile/{username}` | `/{username}` |
| Like | `/app/post/{tokenId}` | ✓ Already correct |
| Comment | `/app/post/{tokenId}` | ✓ Already correct |
| Comment Reply | `/app/post/{tokenId}` | ✓ Already correct |
| Tip | `/app/post/{tokenId}` | ✓ Already correct |
| Subscription | `/app/profile/{username}` | `/{username}` |
| PPV Purchase | `/app/profile/{username}` | `/{username}` |
| Livestream Start | `/app/post/{tokenId}` | ✓ Already correct |
| Video Milestone | `/app/post/{tokenId}` | ✓ Already correct |
| Video Removal | `/app/settings` | ✓ Already correct |

## Changes

### 1. Update `getNavigationLink` function in NotificationsPage

The function at lines 92-118 will be updated to use the correct root-level profile URL pattern (`/{username}`) instead of `/app/profile/{username}`:

```text
Before: /app/profile/someuser
After:  /someuser
```

This affects:
- **Following notifications** → Takes you to the follower's profile
- **Subscription notifications** → Takes you to the subscriber's profile  
- **PPV Purchase notifications** → Takes you to the buyer's profile

### 2. Update avatar profile link in `NotificationItem`

The `profileLink` variable at lines 131-135 also uses the wrong pattern and will be corrected:

```text
Before: /app/profile/username
After:  /username
```

This ensures clicking on someone's avatar in a notification also goes to the correct profile page.

---

## Technical Details

**File Modified:** `src/pages/app/NotificationsPage.tsx`

**Lines Changed:**
- Lines 92-118: `getNavigationLink()` function - fix profile URL pattern
- Lines 131-135: `profileLink` variable - fix avatar click URL pattern

The fix aligns notification navigation with the rest of the app, which uses `/${username}` for all profile links (as seen in LeaderboardPage, CommentsSection, CardHeader, WhoToFollow, etc.).
