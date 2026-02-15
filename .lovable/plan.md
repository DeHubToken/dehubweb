

## Fix Stale Username Navigation in Notifications

### Problem
When a user changes their username, old notifications still reference the previous username. Clicking these notifications navigates to `/{oldUsername}`, which shows the "Username available!" page instead of the actual user profile. The mobile app works because it likely resolves profiles by wallet address.

### Solution
Update the notifications page to always prefer navigating by wallet address (`actorAddress`) over username (`actorUsername`), since wallet addresses are immutable and always resolve correctly.

### Changes (1 file)

**`src/pages/app/NotificationsPage.tsx`**

1. Update `getNavigationLink()` (lines 222-232) -- for `following`, `subscription`, and `ppv_purchase` types, prefer `actorAddress` over `actorUsername`
2. Update `profileLink` (lines 279-283) -- prefer `actorAddress` for the avatar link destination
3. Update the avatar `<Link>` condition (line 314) -- show clickable avatar when `profileLink` exists (not just when `actorUsername` exists)

All three changes follow the same pattern: use `actorAddress` as the primary navigation target, with `actorUsername` as fallback.

