## Problem

On `/app/post/:id` for text posts, the poll renders twice. `PostCard` already renders `<PollCard tokenId={...} />` internally (PostCard.tsx:403), but `SinglePostPage` also renders a standalone `<PollCard>` directly under `renderContent()` in three places (lines 815, 840, 987). For text posts `renderContent()` returns `<PostCard>`, producing the duplicate.

## Fix

In `src/pages/app/SinglePostPage.tsx`, gate the standalone `PollCard` so it only renders for non-text content (video/image/live), where `renderContent()` doesn't include a PostCard:

- Line 815 (mobile immersive video) — already video-only branch, but harmless; leave or gate.
- Line 840 (desktop video branch) — keep (video path doesn't include PostCard).
- Line 987 (standard layout, covers text/image/live/audio) — change to `{!isTextPost && id && parseInt(id, 10) > 0 && <PollCard ... />}`.

Only line 987 is the actual duplicate for text posts. No other changes needed.