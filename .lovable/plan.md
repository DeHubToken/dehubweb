

## Fix: PPV Content Navigation Guard

**Problem**: Clicking anywhere on a PPV-locked video card's bento area (outside the centered PPV overlay) navigates to the dedicated post page, bypassing the PPV gate. The current guard in `handleCardClick` only blocks navigation when a drawer is already open, but doesn't account for gated content that should never allow direct navigation from the feed.

**Solution**: Add `isContentGated` (which covers both PPV and Bounty locked states) to the `handleCardClick` guard so that clicking the card area does nothing for gated content. Users must interact through the centered overlay to trigger the drawer.

---

### Technical Details

**File**: `src/components/app/cards/VideoCard.tsx`

**Change**: In `handleCardClick`, add a check for `isContentGated` to prevent navigation:

```typescript
const handleCardClick = useCallback((e: React.MouseEvent) => {
  const target = e.target as HTMLElement;
  const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
  if (isInteractive) return;

  // Guard: don't navigate if content is gated or any drawer is open
  if (isContentGated || showBountyDrawer || showPPVDrawer || showLockedDrawer) return;

  cacheVideoForNavigation(queryClient, video);
  navigate(`/app/post/${video.id}`);
}, [navigate, video.id, queryClient, video, isContentGated, showBountyDrawer, showPPVDrawer, showLockedDrawer]);
```

This is a one-line addition that fully blocks card-level navigation for any gated content, forcing users through the proper drawer flow (PPV pay or Bounty view).

