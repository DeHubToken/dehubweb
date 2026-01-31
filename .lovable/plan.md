
# Make All Avatars Match Profile Picture Squareness

## The Problem

The profile page avatar looks properly "squared off" while smaller avatars (in comments, cards, sidebars) appear more rounded - even though both use `rounded-xl`.

**Why this happens:**
- `rounded-xl` = fixed 12px border radius
- On a 112px profile avatar → 12px is ~10% of the size = subtle corners
- On a 32px chat avatar → 12px is 37% of the size = nearly circular

## The Solution

Change small avatars from `rounded-xl` (12px) to `rounded-lg` (8px). This maintains the same visual ratio:
- 32px avatar with 8px radius = 25% = matches the profile look
- 40px avatar with 8px radius = 20% = matches the profile look

---

## Technical Changes

### File: `src/components/ui/avatar.tsx`

Change the base Avatar component to use `rounded-lg` instead of `rounded-xl`:

| Line | Current | New |
|------|---------|-----|
| 12 | `rounded-xl` | `rounded-lg` |
| 22 | `rounded-xl` | `rounded-lg` |
| 32 | `rounded-xl` | `rounded-lg` |

This applies globally to all small avatars (32-40px).

### Files with Large Avatars (Keep `rounded-xl` override)

The profile page already uses direct `<img>` tags with explicit `rounded-xl` for the large avatar, so no changes needed there.

---

## Files to Edit

| File | Change |
|------|--------|
| `src/components/ui/avatar.tsx` | Change `rounded-xl` to `rounded-lg` on Avatar, AvatarImage, and AvatarFallback |

---

## Visual Result

After this change:
- **Small avatars** (32-40px): More squared corners matching the profile aesthetic
- **Large profile avatar**: Unchanged (uses direct `<img>` with `rounded-xl`)
- **Live gradient rings**: Already use `rounded-xl` explicitly, will stay as-is

This creates consistent visual proportions across all avatar sizes.
