

## Fix: Move Navigation Panel Up Without Affecting Logo/Coin

### Current Issue
The sidebar container was shifted up with `-mt-[10px]`, and then the logo/coin were pushed down with `mt-[20px]` - this over-compensated and moved them down 10px from their original position.

### Solution
1. **Remove the sidebar container offset** (`-mt-[10px]` and `pt-0`) - revert to `pt-[2px]`
2. **Reset logo margin** to original `mt-[10px]`  
3. **Remove coin wrapper div** - coin goes back to no extra margin
4. **Add negative margin to the Navigation Bento** - apply `-mt-[10px]` to the navigation panel div only

### Changes to `src/components/app/navigation/DesktopSidebar.tsx`

**Line 75** - Revert aside container:
```tsx
// FROM:
<aside className="... pt-0 -mt-[10px] ...">

// TO:
<aside className="... pt-[2px] ...">
```

**Line 78** - Revert logo button margin:
```tsx
// FROM:
<button ... className="block cursor-pointer mt-[20px]">

// TO:
<button ... className="block cursor-pointer mt-[10px]">
```

**Lines 81-87** - Remove wrapper div from CoinBalanceMenu:
```tsx
// FROM:
<div className="mt-[20px]">
  <CoinBalanceMenu ... />
</div>

// TO:
<CoinBalanceMenu ... />
```

**Line 91** - Add negative margin to Navigation Bento:
```tsx
// FROM:
<div className="bg-zinc-900 rounded-2xl p-2.5 space-y-[2px]">

// TO:
<div className="-mt-[10px] bg-zinc-900 rounded-2xl p-2.5 space-y-[2px]">
```

### Result
- Logo stays at original position (with `mt-[10px]`)
- Coin stays at original position (no extra margin)
- Navigation panel moves up 10px (with `-mt-[10px]` on the bento box)

