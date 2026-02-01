
# Fix: AI Chat Closing Unexpectedly After Multiple Opens/Closes

## Problem Identified

The AI chat closes unexpectedly after many open/close cycles due to two related issues:

1. **Unstable Chat IDs**: `useId()` generates a new ID every time the component mounts. This causes:
   - Orphaned entries accumulating in sessionStorage
   - The minimized state check (`isMinimized(chatId)`) never matching after remount
   - State synchronization problems between the global minimized chats manager and individual chat instances

2. **Dialog/Drawer Modal Interference**: The Radix Dialog and Vaul Drawer components have `onOpenChange` callbacks that fire when the modal is dismissed. With stale state or orphan entries, the open/close logic can behave unexpectedly.

## Solution

### 1. Use Stable Post-Based IDs Instead of React's `useId()`

Replace the dynamic `useId()` with a stable ID derived from the post context:

```typescript
// Before (unstable - new ID each mount)
const chatId = useId();

// After (stable - same ID for same post)
const chatId = useMemo(() => 
  `ai-chat-${postContext.type}-${postContext.author || 'unknown'}-${postContext.title || postContext.caption || 'untitled'}`.replace(/\s+/g, '-').toLowerCase(),
  [postContext.type, postContext.author, postContext.title, postContext.caption]
);
```

### 2. Clean Up Orphaned Entries

Add cleanup logic to the minimized chats hook to remove stale entries on page load:

```typescript
// In use-minimized-chats.ts
// Add a maximum age check or clear on visibility change
```

### 3. Prevent Accidental Closes with Better Event Handling

Add `onInteractOutside` and `onEscapeKeyDown` handlers to prevent unintended closes:

```typescript
// For Dialog
<DialogContent 
  onInteractOutside={(e) => e.preventDefault()} // Only close via X button
  onEscapeKeyDown={(e) => e.preventDefault()}
>

// For Drawer
<Drawer 
  dismissible={false} // Disable swipe-to-dismiss
>
```

### 4. Separate Close and Minimize Logic

Make the close button explicitly close, and only allow the dialog to close through user action, not automatic state changes.

## Files to Modify

1. **`src/components/app/cards/PostAIChat.tsx`**
   - Replace `useId()` with stable ID based on post context
   - Add event handlers to prevent accidental dismissal
   - Improve the close/minimize state management

2. **`src/hooks/use-minimized-chats.ts`**
   - Add cleanup for orphan entries
   - Add a mechanism to clear stale entries older than the session

## Technical Details

### Stable ID Generation
```typescript
const chatId = useMemo(() => {
  const baseId = `${postContext.type}-${postContext.author || 'anon'}`;
  // Hash the title/caption for uniqueness without length issues
  const contentHash = (postContext.title || postContext.caption || '').slice(0, 20);
  return `ai-chat-${baseId}-${contentHash}`.replace(/[^a-zA-Z0-9-]/g, '');
}, [postContext]);
```

### Event Prevention
```tsx
// Dialog (desktop)
<Dialog open={isOpen && !isThisMinimized}>
  <DialogContent 
    onInteractOutside={(e) => e.preventDefault()}
    onEscapeKeyDown={(e) => e.preventDefault()}
    onPointerDownOutside={(e) => e.preventDefault()}
  >
    ...
  </DialogContent>
</Dialog>

// Drawer (mobile)  
<Drawer 
  open={isOpen && !isThisMinimized} 
  dismissible={false}
>
  ...
</Drawer>
```

### Orphan Cleanup
```typescript
// Clear all minimized chats on component unmount or when detected stale
useEffect(() => {
  return () => {
    // On unmount, if this chat is in minimized list but we're unmounting, remove it
    if (isMinimized(chatId)) {
      removeChat(chatId);
    }
  };
}, [chatId]);
```

## Expected Outcome

After these changes:
- The AI chat will only close when you explicitly click the X button
- Clicking outside, pressing Escape, or swiping will not close the chat
- The minimize feature will work consistently across open/close cycles
- No more orphaned entries accumulating in storage
