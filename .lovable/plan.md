
# Adding "Back to Collage" Navigation for Images Feed

## Current Behavior
When users click an image in the collage view, they enter an endless scroll feed view starting from that image. Currently, there's no way to return to the collage view without switching tabs.

## Recommended Options

### Option A: Floating "Grid" Button (Recommended)
Add a floating action button in the top-left corner of the feed view that allows users to return to collage mode. This follows common gallery app patterns (like Instagram's grid icon).

**Pros:**
- Always visible and accessible while scrolling
- Clear visual indication of the action
- Doesn't interfere with content

**Implementation:**
- Add a `Grid3x3` icon button positioned `fixed` or `sticky` at the top of the `EndlessScrollView`
- When clicked, calls `onBackToCollage?.()` which sets `selectedImageId` to `null` and `showImagesCollage` to `true`

---

### Option B: Header Bar with Back Arrow
Add a compact header bar when in feed mode that includes a back arrow and optional title like "Back to Grid".

**Pros:**
- Very clear navigation pattern
- Familiar UX for going "back"

**Cons:**
- Takes up vertical space
- Adds visual clutter

---

### Option C: Double-Tap Images Tab to Return
Since double-tapping the Images tab already toggles filters, we could add logic to also return to collage when in feed mode.

**Pros:**
- No additional UI elements
- Consistent with existing behavior

**Cons:**
- Not discoverable
- Users might not know this exists

---

## Recommended Solution: Option A (Floating Grid Button)

### Files to Modify
- `src/components/app/feeds/ImagesFeed.tsx`
- `src/pages/app/HomePage.tsx`

### Implementation Details

#### 1. Add `onBackToCollage` prop to `ImagesFeed`
```tsx
interface ImagesFeedProps {
  // ... existing props
  onBackToCollage?: () => void;
}
```

#### 2. Update `EndlessScrollView` to show a "Back to Grid" button
Add a floating button at the top of the endless scroll view:
```tsx
<button
  onClick={onBackToCollage}
  className="fixed top-24 left-4 z-20 p-2.5 bg-zinc-900/90 backdrop-blur-sm rounded-xl border border-zinc-700 shadow-lg hover:bg-zinc-800 transition-colors"
  aria-label="Back to grid view"
>
  <Grid3x3 className="w-5 h-5 text-white" />
</button>
```

#### 3. Update `HomePage` to handle back navigation
Add a handler function that resets both states:
```tsx
const handleBackToCollage = () => {
  setSelectedImageId(null);
  setShowImagesCollage(true);
  window.scrollTo({ top: 0, behavior: 'instant' });
};
```

Pass this to `ImagesFeed`:
```tsx
<ImagesFeed 
  // ... existing props
  onBackToCollage={handleBackToCollage}
/>
```

---

## Visual Representation

```
┌─────────────────────────────────┐
│  [⊞] ← Floating grid button    │
│                                 │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  │     Image Card 1        │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │     Image Card 2        │   │
│  └─────────────────────────┘   │
│           ...                   │
└─────────────────────────────────┘
```

## Summary
This adds a simple, discoverable way for users to return to the collage grid view from the endless scroll feed. The floating button stays visible as users scroll and follows familiar mobile app patterns.
