
## Fix: Square-Edged Story Overlay on Profile Avatar

### Problem
When hovering over a profile avatar that has an active story, the "liquid glass" overlay (Play / Image split buttons) appears with square edges. The overlay `div` at line 909 in `ProfilePage.tsx` has `absolute inset-0` but no border-radius, so it doesn't match the parent container's `rounded-[10px]`.

### Solution
Add `rounded-[10px]` to the overlay container on line 910. The parent already has `overflow-hidden`, but the overlay itself should also match the rounding for visual consistency.

### File Changed
- **src/pages/app/ProfilePage.tsx** (line 910): Add `rounded-[10px]` to the overlay's className string, changing:
  ```
  "absolute inset-0 flex overflow-hidden transition-all duration-200"
  ```
  to:
  ```
  "absolute inset-0 flex overflow-hidden rounded-[10px] transition-all duration-200"
  ```
