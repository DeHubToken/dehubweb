

## Fix: Restore Individual Follow Notifications

### Problem
The client-side bundling logic groups all "following" notifications within 24 hours into a single entry, completely removing usa's and outforrder's individual notifications from the list. The user expects to see each follow as its own notification item.

### Solution
Remove the client-side multi-actor bundling for follows. Instead, only use multi-actor display when the **backend already provides** aggregated data (via `aggregatedCount` and `latestActorNames` fields on a single notification).

### Changes

**File:** `src/pages/app/NotificationsPage.tsx`

1. **Remove client-side multi-actor bundling** -- Delete the "following" grouping block (lines 69-94) in `bundleNotifications` that consumes individual follow notifications into a single bundle.

2. **Keep same-actor bundling** -- Retain the logic that groups multiple likes/comments from the same person (e.g., "Frank liked 5 of your posts"), since that consolidates one person's repeated actions.

3. **Support backend-aggregated follows** -- When a single notification arrives from the API with `aggregatedCount > 1` and `latestActorNames`, display it as "okanbey and 2 others started following you" with names below. This uses the API's own aggregation rather than client-side grouping.

4. **Update `getNotificationContent`** -- For `type === 'following'`, check `notification.aggregatedCount > 1` to show "and X others" phrasing. Otherwise show the standard single follow text.

This way, individual follow notifications remain visible as separate items, but if the backend sends a pre-aggregated notification, it still displays nicely.
