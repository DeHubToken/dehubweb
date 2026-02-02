
# Plan: Freeze Feed State Using Overlay Pattern

## Problem Root Cause

The current routing architecture **unmounts HomePage completely** when navigating to a post:

```
/app (HomePage mounted)
  ↓ click post
/app/post/:id (HomePage UNMOUNTS, SinglePostPage mounts)
  ↓ click back
/app (HomePage REMOUNTS from scratch)
```

No amount of sessionStorage or scroll restoration can make this instant because React rebuilds the entire component tree. The feed state, scroll position, and all local state are lost on unmount.

## Solution: Keep HomePage Mounted

Instead of navigating to a separate route, we'll **overlay the SinglePostPage on top of HomePage** while keeping HomePage in the DOM. This is the same pattern used by Instagram, Twitter, and TikTok.

```
/app (HomePage stays mounted, hidden visually)
  ↓ click post
/app/post/:id (SinglePostPage overlays on top)
  ↓ click back  
/app (HomePage becomes visible again - never unmounted!)
```

## How It Works

### 1. Modify AppLayout to Keep HomePage Always Mounted

Instead of using React Router's `<Outlet />` which unmounts pages, we'll:
- Always render HomePage (but hide it visually when on a post page)
- Overlay the post page on top when the URL matches `/app/post/:id`

### 2. Visual Hide Instead of Unmount

When viewing a post:
- HomePage gets `visibility: hidden` (keeps scroll position!)
- SinglePostPage renders in an overlay
- Back navigation just removes the overlay

### 3. URL Still Changes (Deep Links Work)

The URL will still update to `/app/post/:id` so:
- Users can share direct links to posts
- Browser history works normally
- Refreshing on a post page still works

## Technical Implementation

### File: `src/components/app/AppLayout.tsx`

```tsx
import { useLocation, useMatch } from 'react-router-dom';
import HomePage from '@/pages/app/HomePage';
import SinglePostPage from '@/pages/app/SinglePostPage';

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const location = useLocation();
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  
  const isPostOverlay = postMatch || videoMatch;
  const isHomePage = location.pathname === '/app';
  
  // Keep HomePage mounted but hidden when viewing a post from home
  const showHomePageHidden = isPostOverlay && /* came from home */;
  
  return (
    <div>
      {/* HomePage - always mounted when relevant, just hidden when overlay active */}
      {(isHomePage || showHomePageHidden) && (
        <div style={{ visibility: showHomePageHidden ? 'hidden' : 'visible' }}>
          <HomePage />
        </div>
      )}
      
      {/* Post overlay */}
      {isPostOverlay && (
        <div className="fixed inset-0 z-50 bg-black overflow-auto">
          <SinglePostPage />
        </div>
      )}
      
      {/* Other routes use Outlet normally */}
      {!isHomePage && !isPostOverlay && <Outlet />}
    </div>
  );
}
```

## User Experience After Fix

| Action | Before | After |
|--------|--------|-------|
| Click post from feed | Loading spinner, scroll jumps | Instant overlay, feed frozen underneath |
| Click back | Loading spinner, scroll to top | Instant, exact scroll position preserved |
| Tab state | Lost, resets to Home | Preserved, same tab selected |
| Feed data | Re-fetches | No re-fetch, cached data intact |

## Files to Modify

1. **`src/components/app/AppLayout.tsx`** - Add conditional rendering logic
2. **`src/pages/app/HomePage.tsx`** - Minor adjustments for overlay compatibility
3. **`src/pages/app/SinglePostPage.tsx`** - Add close/back handler for overlay mode

## Edge Cases Handled

- **Direct link to post**: Works normally (HomePage not pre-mounted)
- **Browser refresh on post page**: Works normally  
- **Deep linking**: URL still reflects the post being viewed
- **History navigation**: Back/forward buttons work as expected

## Why This Is Better

1. **Zero loading** - Feed never unmounts, nothing to reload
2. **Perfect scroll restoration** - DOM never changes, scroll position just is where it was
3. **Instant transitions** - Just showing/hiding, no React reconciliation
4. **Same pattern as major apps** - Twitter, Instagram, TikTok all do this
