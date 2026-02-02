
# Fix Story Thumbnail Size Mismatch

## Problem
The create story button and story thumbnails are now different sizes because:
- **Create button**: Has gradient → `p-0.5` dark layer → content (total ~61px)
- **Story thumbnail**: Has gradient → content directly (total ~57px)

When we removed the dark border from the thumbnail, we also removed the padding layer that gave it consistent sizing with the create button.

## Solution
Add back the padding layer to the story thumbnail, but make it transparent instead of dark. This preserves the sizing while keeping only the gradient border visible.

## Changes

**File: `src/components/app/cards/StoriesBar.tsx`**

Update the story item rendering (lines 241-259) to include a transparent inner padding layer:

```tsx
<div className="p-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
  <div className="p-0.5 rounded-lg">  {/* Add transparent padding layer */}
    {item.thumbnail ? (
      <div className="w-14 h-14 rounded-lg overflow-hidden">
        <img ... />
      </div>
    ) : (
      <Avatar className="w-14 h-14 rounded-lg">
        ...
      </Avatar>
    )}
  </div>
</div>
```

This ensures both the create button and story thumbnails have identical outer dimensions while keeping the visual design (gradient border only on stories, gradient + dark on create button).
