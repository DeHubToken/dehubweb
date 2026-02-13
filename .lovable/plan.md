

## Fix: Handle text centering under short display names

### Root Cause
The `<button>` element in CardHeader (line 100) inherits `text-align: center` from the browser default for buttons. The display name text is unaffected because it sits inside a `relative inline-flex` wrapper (line 122) which creates its own formatting context. However, the handle `<span>` (line 136) is a regular element that inherits the centered text alignment from the button ancestor.

This creates a visible rightward shift of the handle text, especially noticeable for users with short display names like "Viral" or "Chaos" (5 characters), where the difference between centered and left-aligned text is obvious. Users with longer names appear fine because the center offset is less visible.

### Fix
**File: `src/components/app/cards/CardHeader.tsx`** (1 line change)

Add `text-left` to the button element on line 103 to explicitly override the browser's default `text-align: center`:

```tsx
// Line 103 - before:
className={`flex items-center gap-3 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}

// After:
className={`flex items-center gap-3 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
```

This ensures all text descendants of the button left-align consistently, matching the display name's alignment.

