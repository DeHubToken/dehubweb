

## Fix: Comment Copy Link Not Including Comment ID

### Investigation Summary

I thoroughly tested the "Copy Link" feature in the browser. Here's what I found:

1. **The code is correct** -- at line 247 in `CommentsSection.tsx`, the URL is built as:
   ```
   ${window.location.origin}/app/post/${tokenId}?comment=${comment.id}
   ```
   And the API returns valid comment IDs (e.g., `"938"`, `"934"`, `"935"`).

2. **There are TWO different "Copy Link" buttons** that look the same:
   - **Post-level Copy Link** (in `ActionBar.tsx`, line 225): copies just `/app/post/2719` with NO comment ID -- this is the share button below the post content
   - **Comment-level Copy Link** (in `CommentsSection.tsx`, line 247): copies `/app/post/2719?comment=938` WITH the comment ID -- this is inside the share dropdown on each individual comment

3. **There's also a Share icon in the comments panel header** (line 712-718 in `CommentsSection.tsx`) that does nothing when clicked -- no handler attached at all.

You might be clicking the post-level share button (ActionBar) which only copies the post link, not the comment-specific one.

### To verify, here's what I'll do:

1. **Add a visible toast message** that includes the actual URL being copied, so you can confirm which button is being triggered and what URL it produces.

2. **After verification**, I'll remove the debug toast and keep only the clean "Comment link copied" message.

### Technical Change

**File: `src/components/app/cards/CommentsSection.tsx`** (line 247)

Temporarily update the toast to show the copied URL:
```typescript
onClick={() => {
  const url = `${window.location.origin}/app/post/${tokenId}?comment=${comment.id}`;
  navigator.clipboard.writeText(url);
  toast.success(`Copied: ${url}`);
}}
```

This will show the full URL in the toast so you can confirm the comment ID is present. Then we can identify if the issue is with which button you're pressing.

