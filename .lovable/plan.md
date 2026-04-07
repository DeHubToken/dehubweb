

## Fix: AI Assistant always refers to first image in multi-image posts

### Problem
When a user views a multi-image post and opens the AI chat, the AI always analyzes image 1 regardless of which image the user is currently viewing. Two root causes:

1. **Welcome message sticks**: The initial welcome message is set once when the chat opens and never updates when the user swipes to a different image. It keeps saying "image 1 of 4" even after swiping.

2. **Chat history confuses the model**: Even though `postContext.imageUrl` updates correctly to the active image, previous messages in the conversation were about a different image. The AI sees the old conversation context and may still reference the wrong image.

### Solution

**Reset the chat when the active image changes** — clear messages and regenerate the welcome message with the correct image index. This ensures:
- The welcome message shows the correct "image X of Y"
- The image URL sent to the AI matches what the user sees
- No stale conversation about a different image confuses the model

### Files to change

| File | Change |
|------|--------|
| `src/components/app/cards/PostAIChat.tsx` | Add a `useEffect` that watches `postContext.activeImageIndex`. When it changes and the chat is open, clear messages so the welcome message regenerates with the updated index. Also add a `key` or ref tracking to detect the change. |
| `src/components/app/cards/ImageCard.tsx` | No changes needed — already passes `activeImageIndex` correctly |

### Technical detail

In `PostAIChat.tsx`, add:
```typescript
// Reset chat when user swipes to a different image
const prevImageIndexRef = useRef(postContext.activeImageIndex);
useEffect(() => {
  if (postContext.activeImageIndex !== undefined && 
      prevImageIndexRef.current !== postContext.activeImageIndex) {
    prevImageIndexRef.current = postContext.activeImageIndex;
    // Clear messages so welcome message regenerates with correct image
    setMessages([]);
  }
}, [postContext.activeImageIndex]);
```

This is a small, targeted fix — the existing `useEffect` that sets the welcome message already runs when `messages.length === 0`, so clearing messages triggers the correct welcome message with the updated image index automatically.

