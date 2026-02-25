

## Problem

The spring animation on the liquid glass tab indicators (`layoutId` motion divs) bounces/overshoots during transitions. Parent containers clip this bounce because:

1. **`overflow-x-auto` implicitly sets `overflow-y: auto`** — In CSS, setting one overflow axis to `scroll`/`auto` forces the other to `auto` (not `visible`). So the profile tabs' inner `overflow-x-auto` scrollbar container clips the vertical bounce.
2. **`rounded-2xl` on bento containers** — Combined with any overflow setting, this clips content at the border radius corners.

## Affected Locations

| Location | Container Issue |
|---|---|
| **ProfilePage.tsx** (line 308-309) | Outer bento `rounded-2xl`, inner flex `overflow-x-auto` |
| **ExplorePage.tsx** (line 812) | Outer bento `rounded-2xl p-2` |
| **CommentsSection.tsx** (line 793) | `flex gap-1 relative` (less affected) |
| **AnimatedFilterPill** usages in VideosFeed, ImagesFeed | Already have `overflow-y-visible` (partially fixed) |

## Fix

For each tab row container that holds a layoutId glass indicator:

1. **Add explicit `overflow-y: visible`** on the scrollable flex row so the vertical bounce of the spring animation is not clipped, while horizontal scroll still works where needed.
2. **Add `overflow: visible`** on the outer bento wrapper so `rounded-2xl` does not create a clipping context that cuts off the animated indicator.
3. **Add small vertical padding** (`py-1`) on the inner flex to give the spring overshoot room to breathe without visually breaking the layout.

### Specific changes:

**ProfilePage.tsx**
- Line 308: outer bento div — add `overflow-visible`
- Line 309: inner flex div — change `overflow-x-auto` to `overflow-x-auto overflow-y-visible`, add `py-1`

**ExplorePage.tsx**
- Line 812: outer bento div — add `overflow-visible`
- Line 813: inner flex div — add `overflow-y-visible py-1`

**CommentsSection.tsx**
- Line 793: flex container — add `overflow-y-visible py-1`

**AnimatedFilterPill usages** (VideosFeed, ImagesFeed, etc.) already have `overflow-y-visible` and `py-1`, so those are fine.

This is a CSS-only fix — no logic or component API changes.

