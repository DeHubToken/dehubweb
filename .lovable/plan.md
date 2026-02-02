
# Clickable Post Cards Implementation Plan

## Overview
Make all feed cards (PostCard, ImageCard, VideoCard, LiveCard) clickable to seamlessly navigate to the individual post page (`/app/post/:postId`) when users tap/click on non-interactive areas. This creates a smooth, app-like experience similar to Twitter/X.

---

## Approach

The key challenge is distinguishing between:
- **Navigation intent**: Clicking on blank/content areas should open the post
- **Interaction intent**: Clicking buttons, menus, action bars, etc. should NOT navigate

**Solution**: Wrap the card container with navigation logic and use `e.stopPropagation()` on interactive elements to prevent navigation bubbling.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/app/cards/PostCard.tsx` | Add click-to-navigate wrapper |
| `src/components/app/cards/ImageCard.tsx` | Add click-to-navigate wrapper |
| `src/components/app/cards/VideoCard.tsx` | Add click-to-navigate wrapper |
| `src/components/app/cards/LiveCard.tsx` | Add click-to-navigate wrapper |

---

## Implementation Details

### 1. Navigation Handler Pattern

Each card will get a navigation wrapper that:
- Uses `useNavigate` from react-router-dom
- Navigates to `/app/post/${post.id}` on click
- Checks if the click target or its parents contain interactive elements

```typescript
const navigate = useNavigate();

const handleCardClick = useCallback((e: React.MouseEvent) => {
  // Don't navigate if clicking on interactive elements
  const target = e.target as HTMLElement;
  const isInteractive = target.closest('button, a, input, [role="button"], [data-no-navigate]');
  if (isInteractive) return;
  
  navigate(`/app/post/${post.id}`);
}, [navigate, post.id]);
```

### 2. Card Container Wrapper

The outer div of each card gets the click handler and cursor styling:

```typescript
<div 
  onClick={handleCardClick}
  className="bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer hover:bg-zinc-800/50 transition-colors"
>
  {/* Card content */}
</div>
```

### 3. Protected Interactive Zones

Elements that should NOT trigger navigation are already using `<button>`, `<a>`, or have click handlers. Key areas:
- Header buttons (AI sparkle, options menu)
- Action bar (like, comment, share, bookmark)
- Comments section
- Video player controls
- Image carousel navigation arrows

These naturally prevent bubbling due to the `closest()` check.

### 4. Special Case: VideoCard

The VideoCard has complex click handling for:
- Play/pause
- Double-tap seek zones
- Fullscreen toggle

For VideoCard, we'll add navigation only to non-video areas (the footer/info section), keeping the video player behavior intact.

---

## Visual Feedback

Add subtle hover states to indicate clickability:
- Background lightens slightly on hover: `hover:bg-zinc-800/50`
- Cursor changes to pointer: `cursor-pointer`
- Smooth transition: `transition-colors duration-200`

---

## Component-Specific Changes

### PostCard
- Wrap entire card with click handler
- Content area and whitespace become clickable
- Header, buttons, and action bar remain interactive-only

### ImageCard  
- Clicking on padding/text areas navigates
- Clicking images opens fullscreen viewer (existing behavior)
- Carousel controls remain functional

### VideoCard
- Only the footer section (title, description, metadata) becomes clickable for navigation
- Video player area retains existing play/pause/seek behavior
- Header buttons remain functional

### LiveCard
- Same pattern as PostCard
- Thumbnail clicks navigate to the live stream page

---

## Summary

This implementation creates a Twitter-like experience where:
1. Tapping anywhere on a post opens it in dedicated view
2. All interactive elements (buttons, controls) remain functional
3. Smooth visual feedback indicates clickability
4. Navigation uses React Router for instant, app-like transitions
