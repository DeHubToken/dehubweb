

## Restore Swipe-to-Fade Effect on Bottom Nav

The last edit removed the `buttonOpacity` logic that made the center `+` button fade out when users swipe right on the bottom nav bar. The scroll progress tracking (`scrollProgress`, `buttonOpacity`) is still in the component but no longer applied to the button.

### What Changed
- The old code used `style={{ backgroundColor: rgba(255, 255, 255, ${buttonOpacity}) }}` to fade the button on scroll
- The new liquid glass styling is purely class-based with no opacity tied to scroll

### Fix
Re-apply the `buttonOpacity` value to the button's container using an inline `opacity` style, while keeping the liquid glass classes intact:

```tsx
<div 
  className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] shadow-[...] transition-all duration-300 active:scale-95"
  style={{ opacity: buttonOpacity }}
>
```

This preserves the liquid glass bubble look at rest and fades the entire button (glass + icon) smoothly as the user swipes right through the scrollable nav items.

### Technical Detail
- `buttonOpacity` is already computed from `scrollProgress` (fades to 0 at ~10% scroll)
- No new state or logic needed -- just re-wiring the existing value to the rendered element

