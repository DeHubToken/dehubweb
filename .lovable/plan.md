
# Fix: Make Pixelated Gradient Effect Visible

## Problem
The current pixelated overlay uses black pixels (`#000`) on a black background (`bg-black`), making the effect completely invisible.

## Solution
Change the pixels to use **dark gray tones** that contrast subtly against the pure black background, creating that barely-visible pixelated texture you're looking for.

---

## Changes to `src/pages/app/CreatorsPage.tsx`

### Update the pixel colors from black to subtle grays:

**Before:**
```tsx
backgroundColor: '#000',
opacity: 0.15 + Math.random() * 0.1,
```

**After:**
```tsx
backgroundColor: `rgb(${30 + Math.random() * 20}, ${30 + Math.random() * 20}, ${30 + Math.random() * 20})`,
opacity: 0.3 + Math.random() * 0.2,
```

This creates scattered dark gray pixels (ranging from `rgb(30,30,30)` to `rgb(50,50,50)`) with slightly higher opacity, providing a very subtle texture against the pure black background.

### Update the radial gradient to use dark grays instead of transparent-to-black:

**Before:**
```tsx
background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.5) 100%)',
```

**After:**
```tsx
background: 'radial-gradient(ellipse at center, rgba(20,20,20,0.1) 0%, rgba(15,15,15,0.2) 70%, rgba(10,10,10,0.3) 100%)',
```

---

## Result
A very subtle, almost invisible pixelated gradient effect using dark grays that will be just barely perceptible against the black background—exactly as requested.
