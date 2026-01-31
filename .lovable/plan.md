
# Make All Avatars Squared (rounded-xl) Consistently

## Problem

The profile page avatars are properly squared off (`rounded-xl`), but avatars elsewhere (comments, side panels, card headers, chat messages) appear more rounded because:

1. The base `Avatar` component uses `rounded-xl` on the container
2. However, `AvatarImage` doesn't inherit rounding—it uses `aspect-square h-full w-full` only
3. This causes the image inside to have no explicit border-radius, making it appear different from the container

## Solution

Update the base `avatar.tsx` component to apply `rounded-xl` consistently to both the image and fallback. This single change will fix ALL avatar instances across the app.

---

## Technical Changes

### File: `src/components/ui/avatar.tsx`

| Line | Current | Change |
|------|---------|--------|
| 22 | `className={cn("aspect-square h-full w-full", className)}` | Add `rounded-xl` to AvatarImage |

**Before:**
```tsx
// AvatarImage (line 22)
className={cn("aspect-square h-full w-full", className)}
```

**After:**
```tsx
// AvatarImage (line 22)
className={cn("aspect-square h-full w-full rounded-xl", className)}
```

This single change ensures every avatar image in the entire app will have squared-off corners matching the container and profile pictures.

---

## Files to Edit

| File | Change |
|------|--------|
| `src/components/ui/avatar.tsx` | Add `rounded-xl` to `AvatarImage` default className |

---

## Impact

This fix will automatically apply to:
- Chat messages
- Comments section
- Who to Follow sidebar
- Card headers (posts, videos, images)
- Leaderboard avatars
- Notifications page
- Messages page
- Stories bar
- Shorts viewer
- All other avatar usages

No individual file changes needed—the single base component update cascades everywhere.
