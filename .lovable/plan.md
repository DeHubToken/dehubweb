

# Fix Profile Tab Switching Shake

## Root Cause

When switching tabs, the current content unmounts instantly and new content mounts, often with a different height. This causes the page layout to reflow -- the container snaps from one height to another, pushing everything below it up or down. That's the "shake."

The `min-h-[200px]` fix only prevents collapse to zero but doesn't prevent the jump between two different content heights (e.g., 800px to 300px).

## Solution

Use a height-locking wrapper that captures the current height before switching, holds it during the transition, then releases after the new content renders. Combined with a CSS opacity crossfade, the switch will feel seamless.

## Changes

### 1. `src/pages/app/ProfilePage.tsx` - Height-locking tab content wrapper

- Replace the static `min-h-[200px]` div with a ref-based wrapper that:
  - On tab change, captures the current `offsetHeight` and sets it as an explicit inline `min-height`
  - After a short delay (e.g., one `requestAnimationFrame` + 50ms), clears the locked height so the container can grow/shrink naturally to the new content
- Add a CSS transition on opacity for the `ProfileTabContent` to fade in new content (150ms ease-in-out)
- Use a `key={activeTab}` on the content wrapper to trigger remount with a fade-in animation

### 2. `src/components/app/profile/ProfileTabContent.tsx` - Remove loading flicker sources

- Remove the early-return loading spinner for content tabs -- since content is already cached from the profile data hook, this spinner causes an unnecessary blank frame
- Instead, show content immediately if data exists (`hasData` is true), only show spinner on very first load
- Add `animate-in fade-in duration-150` class to the root element of each tab case for a subtle entrance

## Technical Approach

```text
Tab Switch Flow (Before):
  Click tab -> unmount old (height drops) -> mount new (height jumps) = SHAKE

Tab Switch Flow (After):
  Click tab -> lock container height -> fade out old -> mount new with fade-in -> unlock height
```

The height lock uses a `useRef` and `useLayoutEffect` triggered by `activeTab` changes:

```tsx
const contentRef = useRef<HTMLDivElement>(null);
const [lockedHeight, setLockedHeight] = useState<number | null>(null);

useLayoutEffect(() => {
  if (contentRef.current) {
    setLockedHeight(contentRef.current.offsetHeight);
  }
  const timer = setTimeout(() => setLockedHeight(null), 100);
  return () => clearTimeout(timer);
}, [activeTab]);
```

The wrapper div uses:
```tsx
<div
  ref={contentRef}
  style={{ minHeight: lockedHeight ? `${lockedHeight}px` : undefined }}
  className="transition-[min-height] duration-150 ease-out"
>
```

This ensures the container never collapses during the switch, eliminating the reflow that causes shaking.
