# Remove redundant top-left padlock badge when content is already gated

## Problem

When a post is gated (Holdings / PPV / combo), the media area shows a large center overlay (blurred media + big lock or ticket icon + "Unlock for…" / "Holdings Required" copy). At the same time, a small lock/ticket badge is rendered in the top-left corner of the same media — so the user sees two padlocks for the same state (see screenshot of @aaron's post).

The bounty badge is independent (no center overlay), so it should stay.

## Fix

Hide the top-left badges whose icon is already shown in the center overlay, on every card type that has both.

### Files & exact spots

1. **`src/components/app/cards/ImageCard.tsx`**, badge row at lines 691–735:
   - Drop the PPV badge (`isPPV && post.ppvPrice`) — the center ticket overlay already covers this when `isPPV` is true.
   - Drop the Lock badge (`isLocked`) — the center lock overlay already covers it.
   - Keep the Bounty (`isW2E`) badge unchanged.
   - Update `hasBadges` so the row only renders when bounty alone is set: `const hasBadges = isW2E;`.

2. **`src/components/app/cards/VideoCard.tsx`**, badge row at lines 1435–1453 (over the media):
   - This block only contains the Locked badge, and it's already gated by `video.isLocked && !canBypassGating` — exactly when the center overlay is shown. Remove the block entirely.
   - Leave the header badge row at lines 200–248 (next to AI / menu buttons) alone — that's a different surface, not stacked on top of the media.

3. No changes to `PostCard.tsx`, `ShortsViewer.tsx`, or `LiveStreamCard.tsx` — they don't render a corner lock over the gated overlay.

## Verification

- Reload home feed → Aaron's post should show only the centered "Holdings Required" overlay; no second lock chip in the top-left.
- Check a PPV-only post → centered ticket overlay only.
- Check a combo (PPV + Holdings) post → centered combo icons only.
- Check a Bounty-only post → bounty badge still appears in the top-left.
- Check a video card → no top-left lock chip on locked videos; header-row lock chip next to AI/menu still appears as before.
