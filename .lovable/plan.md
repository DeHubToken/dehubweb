

# Unify Comment Section Placement Across All Post Types

## Problem
The comments appear visually different between post types because they are placed at different levels in the component hierarchy:

**VideoCard (correct)**
```
<div className="p-3">
  <ActionBar />
  <Title />
  <Metadata />
  <AnimatePresence>
    {showComments && <CommentsSection />}  ← Inside the padded content
  </AnimatePresence>
</div>
```

**ImageCard & PostCard (incorrect)**
```
<div className="p-3">
  <ActionBar />
  <Title />
  <Metadata />
</div>
<AnimatePresence>
  {showComments && <CommentsSection />}  ← Outside the padded content
</AnimatePresence>
```

This causes the comments section to render at the root level of the card without proper padding context.

---

## Solution
Move the `CommentsSection` inside the padded content container for both ImageCard and PostCard to match VideoCard's structure.

---

## Changes Required

### 1. Update ImageCard
**File: `src/components/app/cards/ImageCard.tsx`**

Move the `AnimatePresence` block from after the closing `</div>` of the info section (line 426) to inside the `<div className="p-3 space-y-2">` container.

**Current structure (lines 399-436):**
```tsx
<div className="p-3 space-y-2">
  <ActionBar ... />
  <FeedDescription ... />
  <div className="flex items-center gap-3">...</div>
</div>

{/* Comments outside */}
<AnimatePresence>
  {showComments && <CommentsSection ... />}
</AnimatePresence>
```

**New structure:**
```tsx
<div className="p-3 space-y-2">
  <ActionBar ... />
  <FeedDescription ... />
  <div className="flex items-center gap-3">...</div>

  {/* Comments inside - matching VideoCard */}
  <AnimatePresence>
    {showComments && <CommentsSection ... />}
  </AnimatePresence>
</div>
```

### 2. Update PostCard  
**File: `src/components/app/cards/PostCard.tsx`**

Move the `AnimatePresence` block inside a content wrapper that matches VideoCard's `p-3` structure.

**Current structure (lines 91-119):**
```tsx
<div className="px-3 pb-3">
  <TranslatableText ... />
  <div className="flex items-center gap-3 mt-2">...</div>
</div>

<ActionBar ... />

{/* Comments outside */}
<AnimatePresence>
  {showComments && <CommentsSection ... />}
</AnimatePresence>
```

**New structure:**
Wrap the ActionBar and comments inside a container to match VideoCard's layout:
```tsx
<div className="px-3 pb-3">
  <TranslatableText ... />
  <div className="flex items-center gap-3 mt-2">...</div>
</div>

<div className="px-3 pb-3">
  <ActionBar className="p-0 mb-0" ... />

  {/* Comments inside - matching VideoCard */}
  <AnimatePresence>
    {showComments && <CommentsSection ... />}
  </AnimatePresence>
</div>
```

Or alternatively, restructure to match VideoCard more closely by having a single content section.

---

## Technical Details

The key fix is ensuring all three card types follow this pattern:
```tsx
<div className="p-3"> // or px-3 pb-3
  {/* Other content */}
  <AnimatePresence>
    {showComments && <CommentsSection tokenId={id} onClose={...} />}
  </AnimatePresence>
</div>
```

This ensures:
- Consistent padding/margins around the comments
- Smooth animations work identically
- The visual appearance matches across all post types

---

## Result
All three post types (Video, Image, Text) will have:
- CommentsSection rendered inside the same padded content container
- Identical visual styling and spacing
- Matching the perfected VideoCard implementation

