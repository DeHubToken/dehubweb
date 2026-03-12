

# Add underline on hover to "and N others" text

Small CSS change in `NotificationsPage.tsx`. The "and N others" span that opens the actors drawer needs `hover:underline` added to its className alongside the existing hover color change.

## Change

**File: `src/pages/app/NotificationsPage.tsx`**

Find the clickable "and N others" span (the one with the `onClick` that opens the actors drawer) and add `hover:underline` to its className.

