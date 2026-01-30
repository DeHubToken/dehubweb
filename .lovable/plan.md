

# Unify Comment Sections Across All Post Types

## Problem
The comment sections are inconsistent across post types:
- **VideoCard**: Uses `CommentsSection` (inline, with icon tab switcher, fade effects) - the one we just perfected
- **ImageCard**: Uses `CommentsSection` (same component)
- **PostCard**: Uses `CommentsSheet` (a liquid glass drawer overlay that pops up over the content)

## Solution
Update `PostCard` to use the inline `CommentsSection` component instead of `CommentsSheet`, matching the video and image post experience.

## Changes Required

### 1. Update PostCard Component
**File: `src/components/app/cards/PostCard.tsx`**

- Change import from `CommentsSheet` to `CommentsSection`
- Wrap the comments in `AnimatePresence` for smooth enter/exit animations (matching ImageCard)
- Use `CommentsSection` with the same props pattern as ImageCard/VideoCard

**Before:**
```tsx
import { CommentsSheet } from '../comments';
...
{showComments && (
  <CommentsSheet
    tokenId={post.id}
    onClose={() => setShowComments(false)}
  />
)}
```

**After:**
```tsx
import { CommentsSection } from './CommentsSection';
import { AnimatePresence } from 'framer-motion';
...
<AnimatePresence>
  {showComments && (
    <CommentsSection
      tokenId={post.id}
      onClose={() => setShowComments(false)}
    />
  )}
</AnimatePresence>
```

## Result
All three post types (Video, Image, Text) will use the same inline `CommentsSection` with:
- Icon-only tab switcher (Replies, Quotes, Search, Sort)
- Smooth transparency fade effects at top and bottom
- Consistent spacing and input styling
- Embedded within the bento card rather than overlaying as a drawer

