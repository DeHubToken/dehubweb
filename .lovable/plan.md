

## Fix PPV/Bounty/Locked Badge Taps on Mobile

**Problem**: Tapping PPV, Bounty, or Locked badges on feed posts doesn't open the drawer on mobile. Desktop works fine. The root cause is `DrawerTrigger asChild` nested inside the video card overlay -- vaul's DOM manipulation on mobile touch events conflicts with the card's event handling and causes the drawer to never open.

**Solution**: Convert the three badge drawers from the `DrawerTrigger` pattern to the controlled-state pattern, matching how `MobileCreatorInfo` already handles it (and works correctly).

### What changes

**File: `src/components/app/cards/VideoCard.tsx`**

Replace the PPV, Bounty, and Locked badge sections (lines 985-1130) from:

```tsx
<Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
  <DrawerTrigger asChild>
    <button onClick={(e) => e.stopPropagation()}>...</button>
  </DrawerTrigger>
  <DrawerContent>...</DrawerContent>
</Drawer>
```

To the controlled pattern:

```tsx
{/* Just the button inline */}
<button onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}>
  ...
</button>
```

Then move all three `Drawer` components (PPV, Bounty, Locked) out of the overlay div and render them at the root level of the VideoCard return -- as standalone controlled drawers with no `DrawerTrigger`:

```tsx
<Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
  <DrawerContent glass>...</DrawerContent>
</Drawer>
```

Same change for Bounty and Locked drawers.

### Why this works

The `MobileCreatorInfo` component at the bottom of the same file already uses this exact pattern (plain button + controlled Drawer at root level) and works perfectly on mobile. The `DrawerTrigger` pattern fails because vaul intercepts touch events and manipulates pointer-events on ancestor containers, which conflicts with the video overlay's `stopPropagation` and navigation handlers.

### Scope

- One file changed: `VideoCard.tsx`
- Three drawer refactors (PPV, Bounty, Locked) -- all identical pattern changes
- No visual or behavioral changes on desktop -- drawers will continue to work the same way
- State variables (`showPPVDrawer`, `showBountyDrawer`, `showLockedDrawer`) already exist and are reused

