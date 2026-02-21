

## Fix: Block Downloads on Locked/PPV Content

### Problem
The "Download" option in the three-dot menu (options drawer) is always visible and functional, even for PPV and locked videos/images. Users can bypass the paywall by simply downloading gated content without paying.

### Affected Locations
There are **4 places** where an unguarded download button exists:

1. **VideoCard.tsx** - Mobile options drawer (line ~903)
2. **VideoCard.tsx** - Desktop/immersive options drawer (line ~1354)
3. **ImageCard.tsx** - Options drawer (line ~442)
4. **SinglePostPage.tsx** - Options drawer (line ~732)

### Solution
Conditionally hide the download button when the content is gated (PPV, locked, or bounty/W2E). The button will only render if none of these gating flags are true.

### Technical Details

**VideoCard.tsx (2 locations)**
- The component already has `isPPVLocked`, `isBountyLocked`, and `isContentGated` computed booleans, plus `video.isLocked`
- Wrap both download buttons with a condition: only show if `!isContentGated && !video.isLocked`

**ImageCard.tsx**
- The component receives `isPPV`, `isW2E`, and `isLocked` props
- Wrap the download button: only show if `!isPPV && !isW2E && !isLocked`

**SinglePostPage.tsx**
- The page fetches post data including gating flags (`is_ppv`, `is_w2e`, `is_locked`)
- Wrap the download button: only show if none of those flags are true

This is a UI-only guard -- the actual media URLs come from the CDN and are not proxied through an auth layer. However, since the video player itself is already blocked (thumbnail + overlay) for gated content, removing the download button closes the remaining bypass vector in the app's UI.

