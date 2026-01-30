
# Fix AI Action Buttons and Toggle Styling

## Overview
This plan addresses two styling inconsistencies where elements are too circular:
1. The AI Assistant action buttons ("What's new?", "Generate an image", etc.) use fully circular pill-shape styling
2. The toggle switches have rounded styling that doesn't match the rest of the UI

## Changes to Make

### 1. AI Assistant Action Buttons
**File:** `src/pages/app/AssistantPage.tsx` (lines 1586-1623)

Change all four quick action buttons from `rounded-full` to `rounded-xl`:
- "What's new?" button (line 1590)
- "Generate an image" button (line 1601)
- "Edit an image" button (line 1609)
- "Generate a video" button (line 1620)

**Before:**
```tsx
className="px-3 py-1.5 text-xs rounded-full bg-white/10 ..."
```

**After:**
```tsx
className="px-3 py-1.5 text-xs rounded-xl bg-white/10 ..."
```

### 2. Toggle Switch Styling
**File:** `src/components/ui/switch.tsx`

The toggle currently has:
- Track: `rounded-xl` (good for the track)
- Thumb: `rounded-xl` (on a 20x20px element, this is almost circular)

Change to use `rounded-lg` for a more squared-off look that matches the app's bento aesthetic:
- Track: Keep `rounded-xl` for the outer container
- Thumb: Change to `rounded-lg` for a less circular appearance

**Before:**
```tsx
// Thumb
"... h-5 w-5 rounded-xl bg-zinc-900 ..."
```

**After:**
```tsx
// Thumb
"... h-5 w-5 rounded-lg bg-zinc-900 ..."
```

## Summary of Files to Edit
| File | Change |
|------|--------|
| `src/pages/app/AssistantPage.tsx` | Replace 4 instances of `rounded-full` with `rounded-xl` on lines 1590, 1601, 1609, 1620 |
| `src/components/ui/switch.tsx` | Change thumb from `rounded-xl` to `rounded-lg` on line 20 |

## Visual Result
- Action buttons will have subtle rounded corners instead of fully pill-shaped ends
- Toggle switches will have a squared-off thumb that matches the track's rounded edge style
- Both changes maintain the liquid glass aesthetic while feeling less circular
