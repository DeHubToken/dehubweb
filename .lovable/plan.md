

## Fix: Uneven Card Heights in Multi-Column Grid

### The Problem

In the 2/3-column collapsed layout, each grid row is as tall as its tallest card. Since card types have very different natural heights:
- **PostCard** (text-only): ~100-200px
- **VideoCard**: forced `aspect-video` (~56% width ratio)
- **ImageCard**: variable, up to `max-h-[600px]`

...shorter cards leave large black gaps beneath them in each row.

### Recommended Solution: CSS Masonry via `columns`

Instead of CSS Grid (`grid-cols-2/3`), switch to a **CSS multi-column layout** (`columns-2` / `columns-3`). This produces a Pinterest/Masonry-style flow where each card stacks tightly below the previous one in its column, eliminating vertical gaps entirely.

### What Changes

**File: `src/components/app/feeds/HomeFeed.tsx`**

1. Replace `grid grid-cols-2 xl:grid-cols-3 gap-3` with `columns-2 xl:columns-3 gap-3`
2. Wrap each feed item in `break-inside-avoid mb-3` so cards don't split across columns
3. Full-width inserts (Shorts carousel, Radio, Live, Who-to-follow) get `column-span-all` — but since CSS `column-span: all` has limited browser support, these sections will be rendered **outside** the multi-column container (before/after), keeping the same visual insert positions

**File: `src/components/app/feeds/HomeFeed.tsx` — `renderFeedWithShorts()`**

The current function interleaves carousels into a flat list. For the masonry approach when collapsed:
- Split the feed items into segments separated by full-width inserts
- Render each segment in its own `columns-2/3` container
- Render full-width inserts (Shorts, Radio, Live) between segments at full width

When **not** collapsed, everything stays exactly as it is today (single column, `space-y-3`).

### Visual Result

```text
BEFORE (grid):                    AFTER (masonry columns):
┌──────────┬──────────┐          ┌──────────┬──────────┐
│ Text post│ Video    │          │ Text post│ Video    │
│ (short)  │ (tall)   │          │          │          │
│          │          │          ├──────────┤          │
│ BLACK    │          │          │ Image    │          │
│ GAP      │          │          │          ├──────────┤
├──────────┼──────────┤          │          │ Text     │
│ Image    │ Text     │          ├──────────┤          │
│ (tall)   │ (short)  │          │ Video    ├──────────┤
│          │          │          │          │ Image    │
│          │ BLACK    │          │          │          │
│          │ GAP      │          │          │          │
└──────────┴──────────┘          └──────────┴──────────┘
```

### Technical Details

- `columns-2` / `columns-3` is well-supported in all modern browsers
- `break-inside: avoid` prevents a single card from being split across two columns
- `mb-3` on each item provides consistent vertical spacing (replaces `gap-3` which doesn't apply in column layout)
- Full-width sections break out of the column container to span the entire width
- No changes to individual card components — only the container layout changes

### Files to Modify
- `src/components/app/feeds/HomeFeed.tsx` — container classes + renderFeedWithShorts segmentation logic

