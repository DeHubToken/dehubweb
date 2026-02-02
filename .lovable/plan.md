

# Fix Low-Resolution Video Frame Thumbnails

## Problem
The video frame extraction is currently using a very small canvas size of **160x90 pixels**, which creates blurry thumbnails when displayed in:
- The main thumbnail preview (280-380px wide)
- The frame selection strip (64px wide)

## Solution
Increase the canvas resolution used for frame extraction to **640x360 pixels** (maintaining 16:9 aspect ratio). This provides:
- Crisp display in the large thumbnail preview
- More than enough resolution for the small frame strip
- Reasonable file size for blob URLs

## Technical Change

**File:** `src/features/post/components/PostMediaPreview.tsx`

**Current code (around line 311-312):**
```typescript
canvas.width = 160;
canvas.height = 90;
```

**Updated code:**
```typescript
canvas.width = 640;
canvas.height = 360;
```

## Files Modified
- `src/features/post/components/PostMediaPreview.tsx` - Increase canvas dimensions from 160x90 to 640x360

## Result
Frame thumbnails will now be 4x higher resolution, appearing sharp in both the main preview and the selection strip.

