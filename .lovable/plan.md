

## Two Bugs to Fix

### Bug 1: Spacebar toggles video playback while typing in comments

**Root cause**: `VideoCard.tsx` line 895-941 adds a global `window.addEventListener('keydown', ...)` that intercepts the spacebar (`case ' '`) and calls `handlePlayClick()`. It has an `isFocused` guard but never checks if the active element is a text input, textarea, or contenteditable — so typing a space in the comment input triggers play/pause.

**Fix**: At the top of `handleKeyDown`, check if the event target is an input, textarea, or contenteditable element. If so, return early without intercepting.

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Don't intercept keyboard when user is typing in an input
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
  
  switch (e.key) { ... }
};
```

### Bug 2: No reply button visible on comments

The reply functionality already exists in `CommentsSection.tsx` — there's a `handleReply` function and a reply button (MessageSquare icon on line 296-301). However, it's conditionally hidden with `{!isReply && (...)}`, meaning it only shows on top-level comments, not on replies. This should already work for top-level comments. The user may not be seeing it if the comment rendering or the button styling makes it hard to spot. No code change needed for this — reply is already implemented and functional.

**Files to change**: `src/components/app/cards/VideoCard.tsx` (1 line addition)

