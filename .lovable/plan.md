

## Root Cause

When you add a video, the form auto-moves your typed text into `titleText` and clears `text` (line 298-302). But when building the optimistic post, line 1138 reads `text` (now empty) instead of `titleText` for the title. Same bug on line 1164 for image posts.

The actual mint call on lines 987-996 correctly uses `titleText` — so after refresh the title appears. The optimistic preview just has the wrong source field.

## Fix

**File: `src/features/post/hooks/usePostForm.ts`**

Update the optimistic post construction to mirror the same title/description logic used by the mint call (lines 987-1001):

- **Video post (line 1138)**: Change `title: text.trim().split('\n')[0] || ''` → use `titleText.trim() || text.trim().split('\n')[0] || ''` and add `description: text.trim()`.
- **Image post (line 1164-1165)**: Same fix — use `titleText.trim()` when `showTitle && titleText.trim()`, otherwise fall back to first line of `text`.

This is a 2-line fix in one file. No other changes needed.

