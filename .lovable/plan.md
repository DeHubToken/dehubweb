
# Fix Camera Modal Button Delay

## Problem Analysis
The post modal uses a **vaul Drawer** component with `modal={true}` (the default). Modal drawers create:
- A focus trap that prevents interaction outside the drawer
- A pointer-events blocking overlay at z-index 100

When the camera modal opens via `createPortal`, even though it has a higher z-index (`z-[9999]`), the drawer's modal behavior still intercepts pointer events and blocks interaction. This causes the buttons to appear unclickable for several seconds until the browser's focus management resolves.

The **StoryRecorderModal** works instantly because it's a standalone full-screen component that isn't nested inside any modal/drawer - it completely takes over the screen without competing with another modal's focus trap.

## Solution
Disable the Drawer's modal behavior when the camera capture modal is open. This removes the focus trap and allows the camera modal to receive pointer events immediately.

## Changes Required

### File: `src/features/post/PostModal.tsx`
1. Pass `isCameraModalOpen` state to determine drawer modal behavior
2. Set `modal={!state.isCameraModalOpen}` on the Drawer component - when camera is open, drawer becomes non-modal

```typescript
// Before:
<Drawer open={isOpen} onOpenChange={handleClose}>

// After:
<Drawer 
  open={isOpen} 
  onOpenChange={handleClose}
  modal={!state.isCameraModalOpen}
>
```

## Why This Works
- When `isCameraModalOpen` is `false`: Drawer operates normally with `modal={true}`
- When `isCameraModalOpen` is `true`: Drawer switches to `modal={false}`, removing the focus trap and pointer-events blocking, allowing the camera modal to receive all interactions instantly

## Technical Notes
- The vaul Drawer library's modal mode creates an internal focus trap using `aria-modal`
- Setting `modal={false}` turns the drawer into a non-blocking overlay
- The camera modal already uses `createPortal` to render at the document root, so it will layer correctly
- No changes needed to the CameraCaptureModal itself - the fix is in the parent Drawer configuration
