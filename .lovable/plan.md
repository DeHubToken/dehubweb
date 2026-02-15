

## Convert ErrorBoundary Buttons to Glass Variant

The error/fallback page in `src/components/ErrorBoundary.tsx` has three buttons that use manual white/10 styling instead of the `variant="glass"` standard.

### Changes

**File: `src/components/ErrorBoundary.tsx`**

1. **"Try Again" button (line ~108)**: Replace inline `bg-white/10 backdrop-blur-xl border border-white/10` classes with `variant="glass"`
2. **"Go Home" button (line ~115)**: Same change -- replace inline glass-like classes with `variant="glass"`
3. Both buttons keep their existing `flex-1 h-12 rounded-xl gap-2` sizing classes

Before:
```tsx
<Button className="flex-1 h-12 rounded-xl bg-white/10 backdrop-blur-xl border border-white/10 text-white hover:bg-white/15 gap-2">
```

After:
```tsx
<Button variant="glass" className="flex-1 h-12 rounded-xl gap-2">
```

This is a 2-line change that brings the error page in line with the liquid glass design system.

