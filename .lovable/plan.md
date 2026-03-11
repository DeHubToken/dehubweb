

## Problem

When the user closes the post drawer, `handleClose` calls `resetForm()` which clears all form state AND removes the active draft from localStorage. This completely defeats the draft persistence we added.

## Root Cause

In `PostModal.tsx` line 30-33:
```typescript
const handleClose = () => {
  actions.resetForm();  // ← THIS wipes everything + clears localStorage
  onClose();
};
```

## Fix

**`src/features/post/PostModal.tsx`**: Change `handleClose` to just close the drawer without resetting the form. The auto-save `useEffect` already persists the draft to localStorage, so the content will survive close and refresh.

```typescript
const handleClose = () => {
  onClose();  // Just close — draft auto-persists via useEffect
};
```

`resetForm` should only be called after a successful post. Let me verify that's already the case in the post handler.

**`src/features/post/hooks/usePostForm.ts`** — verify `resetForm` is called inside `handlePost` after success (it should already be). No changes needed there if so.

This is a one-line fix in `PostModal.tsx`.

