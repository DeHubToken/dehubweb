

# Fix: Audio and Live Popovers in Post Modal

## Problem Analysis

After reviewing the code, session replay data, and researching this issue, I've identified the root cause:

**The Popover opens but immediately closes** because of a conflict between:
1. The **Vaul Drawer** (used for the Post Modal) which has `modal={true}` by default
2. The **Radix Popover** inside it, which renders its content in a **Portal** outside the drawer

When you click the Music or Live button, the popover opens, but when you try to interact with it (or even just after it opens), the drawer's overlay captures the "outside click" event and triggers the popover to close.

The `modal={true}` prop on the Popover was a good attempt, but it's not sufficient because the z-index layering and portal rendering create a conflict.

---

## Solution

### 1. Update the Popover component to support preventing outside clicks

Modify `src/components/ui/popover.tsx` to:
- Add `onPointerDownOutside` handler that prevents closing when intended
- Ensure the z-index is higher than the drawer overlay (z-index: 100+)

### 2. Update PostActionBar to properly configure the Audio and Live popovers

In `src/features/post/components/PostActionBar.tsx`:
- Add `onPointerDownOutside={(e) => e.preventDefault()}` to PopoverContent for both Audio and Live popovers
- Increase z-index to ensure popovers render above the drawer
- Keep `modal={true}` on the Popover component

---

## Technical Details

### File: `src/components/ui/popover.tsx`
Update the PopoverContent z-index from `z-50` to `z-[150]` to ensure it renders above the drawer overlay (which is `z-[100]`).

### File: `src/features/post/components/PostActionBar.tsx`
For both the Audio popover (lines 198-238) and Live popover (lines 241-283):

```tsx
<PopoverContent 
  className="... z-[150]"
  onPointerDownOutside={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
  // ... rest of props
>
```

This prevents the popover from closing when clicking inside it, which is being incorrectly triggered by the drawer's modal overlay.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ui/popover.tsx` | Increase z-index to `z-[150]` |
| `src/features/post/components/PostActionBar.tsx` | Add `onPointerDownOutside` and `onInteractOutside` handlers to both popover contents |

