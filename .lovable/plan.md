
# Fix Video Play Button Centering in Post Modal

## Problem
The play button in the video thumbnail preview is not centered on the visible video area. As shown in the screenshot, the play button appears near the bottom of the video instead of the center. This happens because the overlay container follows the video's intrinsic dimensions rather than the visible cropped area.

## Root Cause Analysis
The video preview section has multiple nested `relative` containers without proper height constraints:
1. The outer container at line 310-315 has `aspect-video` but the inner wrappers don't inherit this properly
2. The wrapper at line 506 is just `relative` without height/width constraints
3. The play button overlay at line 568 uses `absolute inset-0` but the parent's dimensions aren't constrained to the visible video area

## Solution

### File: `src/features/post/components/PostMediaPreview.tsx`

1. **Fix the video section wrapper** (around line 506)
   - Change from `<div className="relative">` to `<div className="relative w-full h-full">`
   - This ensures the container fills the aspect-video parent properly

2. **Fix the inner video container** (around line 551)  
   - The container already has `relative w-full h-full` but we need to ensure the video itself doesn't overflow
   - The video should use `max-h-full` to constrain within the container

3. **Ensure the play button overlay is positioned relative to the constrained container**
   - The overlay already uses `absolute inset-0 flex items-center justify-center` which should work once the parent container dimensions are fixed

### Key Changes

```tsx
// Line ~506: Update the outer video wrapper
<div className="relative w-full h-full">
  {/* Processing overlay */}
  ...
  
  {/* Video content */}
  {m.thumbnail ? (
    // Thumbnail case - update container to fill parent
    <div className="relative w-full h-full">
      <img 
        src={m.thumbnail} 
        alt="Video thumbnail" 
        className="w-full h-full object-cover rounded-2xl"
        ...
      />
      {/* Play overlay - already uses inset-0 which will now center properly */}
    </div>
  ) : (
    // Video case - ensure container fills available space
    <div className="relative w-full h-full">
      <video 
        className="w-full h-full object-cover rounded-2xl pointer-events-none"
        ...
      />
      {/* Play/Pause overlay - already uses inset-0 */}
    </div>
  )}
```

## Summary of Changes

| Location | Current | Updated |
|----------|---------|---------|
| Line ~506 wrapper | `relative` | `relative w-full h-full` |
| Line ~521 thumbnail wrapper | `relative` | `relative w-full h-full` |
| Line ~525 thumbnail img | `max-h-80 object-cover` | `h-full object-cover` |

This ensures all containers properly fill the `aspect-video` parent, and the `inset-0` overlay will correctly center the play button within the visible video area.
