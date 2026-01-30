
# Fix Music Tab Navigation Bar Thickness Issue

## Problem Identified

When the Music tab is active, the bottom of the top navigation bar appears thinner compared to other tabs. This is caused by inconsistent sticky positioning in the `RadioSection` component.

## Root Cause

In `src/components/app/radio/RadioSection.tsx` (lines 78-83):

```tsx
<div className={cn(
  "sticky z-20 pt-3 pb-3 ...",
  showFilters 
    ? "top-[7rem] lg:top-[4.5rem]" 
    : "top-[6.5rem] lg:top-[4.5rem]"  // ← Problem: 0.5rem too high
)}>
```

When `showFilters` is `false` (the default state), the sticky element uses `top-[6.5rem]` instead of the correct `top-[7rem]`. This 0.5rem (8px) difference causes the Radio section's sticky header to sit higher than intended, creating the visual appearance of a thinner bar at the bottom of the main navigation.

## Solution

Change `top-[6.5rem]` to `top-[7rem]` so both filter states use consistent positioning. Since the condition only changes on mobile (the `lg:top-[4.5rem]` is the same for both), we can simplify this to always use `top-[7rem]` on mobile.

## File Changes

**`src/components/app/radio/RadioSection.tsx`** (lines 78-83)

Change:
```tsx
showFilters 
  ? "top-[7rem] lg:top-[4.5rem]" 
  : "top-[6.5rem] lg:top-[4.5rem]"
```

To:
```tsx
"top-[7rem] lg:top-[4.5rem]"
```

This removes the conditional entirely since both mobile and desktop values should be consistent regardless of filter state.

---

## Technical Details

| Property | Before | After |
|----------|--------|-------|
| Mobile (no filters) | `top-[6.5rem]` | `top-[7rem]` |
| Mobile (filters shown) | `top-[7rem]` | `top-[7rem]` |
| Desktop (both states) | `top-[4.5rem]` | `top-[4.5rem]` |
