

## Analysis: Blank Spaces in Fullscreen Masonry Feed

### The Problem
In the 3-column fullscreen CSS multi-column masonry layout, blank/white space appears because of how CSS `column-count` works. The browser distributes items top-to-bottom within each column, and when full-width carousels (Shorts, Leaderboard, Radio, Live) break the masonry grid into separate `<div>` segments, each segment's columns can end at different heights — creating visible gaps at the bottom of shorter columns before the next full-width carousel.

### Root Causes

1. **CSS multi-column height balancing**: Each masonry `<div style="columnCount: 3">` segment is independently balanced by the browser. When a segment has few items (e.g., only 5-6 cards), the columns can be very uneven because there isn't enough content to balance across 3 columns.

2. **Segment boundaries before carousels**: The code splits content at fixed intervals (`MIN_ITEMS_BETWEEN = 16` for 3-col). If the total feed has fewer items than expected, segments end up short and unbalanced.

3. **No column-fill control**: The CSS `column-fill` property defaults to `balance`, which tries to equalize column heights but can leave gaps when content heights vary dramatically (images vs text posts).

### Proposed Fixes (No Carousel Changes Needed)

**1. Add `column-fill: auto` to masonry segments that precede a full-width insert**
This tells the browser to fill columns sequentially (left to right, top to bottom) rather than trying to balance them. Combined with a fixed height constraint, this eliminates bottom gaps. However, for the last segment we keep `balance` so all columns end evenly.

**2. Reduce minimum gap between masonry segments**  
Lower `MIN_ITEMS_BETWEEN` from 16 to 12 (for 3-col) and from 12 to 9 (for 2-col). More items per segment means more content to balance across columns, reducing visible gaps. This is a minor tweak — not a major content increase.

**3. Add `columnFill: 'balance'` explicitly to each masonry grid container**
Ensures consistent behavior across browsers.

**4. Eliminate orphan segments**
When the last masonry segment has fewer items than the column count (e.g., 1-2 items in a 3-column layout), merge it with the previous segment to avoid a nearly-empty grid block.

### Implementation Plan

**File: `src/components/app/feeds/HomeFeed.tsx`**

- In `renderMasonryGrid`, add `columnFill: 'auto'` as default, with an optional parameter to use `'balance'` for the final segment
- Reduce `MIN_ITEMS_BETWEEN` constants: `16 → 12` (3-col), `12 → 9` (2-col)  
- In the segment-building logic, merge the last segment with the previous one if it has fewer items than `colCount`
- Ensure each masonry container has no extra margin/padding that could create visual gaps between segments

### Technical Details

```text
Current flow:
  [Masonry Grid 1 (16 items)] → [Carousel] → [Masonry Grid 2 (16 items)] → [Carousel] → [Grid 3 (remaining)]
  
  Problem: Grid ends have uneven columns = visible blank space

Proposed flow:  
  [Masonry Grid 1 (12 items)] → [Carousel] → [Masonry Grid 2 (12 items)] → [Carousel] → [Grid 3 (remaining, merged if tiny)]
  
  Fix: More segments with slightly fewer items = better column distribution
       Orphan merging = no near-empty grids
```

These changes are purely in the masonry rendering logic and don't touch carousel components, card components, or the mobile/expanded sidebar layouts.

