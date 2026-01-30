

# Fix Toggle Switch Track Rounding

## The Problem
Looking at the screenshot, the issue is clear:
- **Black thumb/knob**: Has `rounded-lg` styling - looks good ✓
- **White track/background**: Has `rounded-xl` styling - too circular ✗

The track (white background) needs to match the thumb's less-circular styling.

## Solution
Change the track's `rounded-xl` to `rounded-lg` so both the track and thumb have consistent, squared-off corners.

## File to Edit
**`src/components/ui/switch.tsx`** (line 12)

### Current Code:
```tsx
<SwitchPrimitives.Root
  className={cn(
    "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-xl border-2 ...",
```

### Updated Code:
```tsx
<SwitchPrimitives.Root
  className={cn(
    "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-lg border-2 ...",
```

## Visual Result
Both the white track background and the black thumb will have matching `rounded-lg` corners, giving the toggle a consistent squared-off look that matches the app's bento aesthetic.

