

# Plan: Fix Gap Between Mobile Header and Tab Navigation

## Problem Identified

There's a visual gap between the mobile header (DEHUB logo bar) and the tab navigation bar below it. This is caused by a height mismatch:

| Element | Current Value | Actual/Expected Height |
|---------|---------------|------------------------|
| MobileHeader padding | `py-1.5` (12px) | - |
| MobileHeader content | ~27px (avatar/icons) | - |
| **Total header height** | **~39px** | - |
| Main content `pt-` | `pt-11` (44px) | Should match header |
| Tab nav `top-` | `top-11` (44px) | Should match header |

The 5px gap (44px - 39px = 5px) creates the ugly visual separation.

---

## Solution

Increase the MobileHeader height to match the 44px (top-11) offset by adjusting padding.

### File: `src/components/app/navigation/MobileHeader.tsx`

**Line 43** - Change:
```tsx
// FROM
<header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-1.5 flex items-center justify-between">

// TO
<header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-2.5 flex items-center justify-between">
```

**Change**: `py-1.5` (12px total) becomes `py-2.5` (20px total)

This increases the header height from ~39px to ~47px, which slightly overshoots but ensures no gap. Alternatively, we can use a fixed height.

---

## Alternative: Use Fixed Height (More Precise)

If padding adjustment doesn't align perfectly, use an explicit height:

```tsx
<header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 h-11 flex items-center justify-between">
```

This guarantees the header is exactly 44px (`h-11`) to match `pt-11` and `top-11`.

---

## Technical Details

| File | Line | Change |
|------|------|--------|
| `src/components/app/navigation/MobileHeader.tsx` | 43 | Change `py-1.5` to `h-11` for exact 44px height |

---

## Expected Result

After this fix:
- The mobile header will be exactly 44px tall
- The tab navigation bar will sit flush against the header with no gap
- Consistent alignment across all pages using `top-11` sticky positioning

