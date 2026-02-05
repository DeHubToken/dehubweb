
# Fix Image Carousel Navigation Buttons & Counter

## Problem Identified
The previous update to convert circular buttons to squared-off styling missed the **ImageCard carousel** component. From your screenshot, I can see:
1. **Image switching arrows** (chevron left/right) - still using `rounded-full`
2. **Image counter badge** (showing "2/2") - still using `rounded-full`

These elements in `ImageCard.tsx` were not updated to match the liquid glass aesthetic that was correctly applied to `FullscreenImageViewer.tsx`.

## Files to Update

### 1. `src/components/app/cards/ImageCard.tsx`
**Current styling (lines 171-187, 210-214):**
- Navigation arrows: `w-8 h-8 rounded-full bg-black/60`
- Counter badge: `rounded-full bg-black/60`

**New styling to apply:**
- Navigation arrows: `w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10`
- Counter badge: `rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10`

### 2. `src/components/app/tv/TVChannelCard.tsx`
**Mute button (line 286):** `rounded-full` → `rounded-xl` with liquid glass effect

### 3. `src/features/post/components/LinkPreviewCard.tsx`
**Remove button (line 59):** `rounded-full` → `rounded-xl` with liquid glass effect

## Visual Result
After this update, the image carousel will have:
- Squared-off navigation arrows matching the Shorts viewer and video players
- Squared-off counter badge matching the fullscreen image viewer
- Consistent liquid glass aesthetic across all media controls

---

## Technical Details

### ImageCard.tsx Changes
```tsx
// Navigation arrows - before:
className="... w-8 h-8 rounded-full bg-black/60 ..."

// Navigation arrows - after:
className="... w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 ..."

// Counter badge - before:
className="... rounded-full bg-black/60 ..."

// Counter badge - after:
className="... rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 ..."
```
