
Goal: remove the remaining black gaps in 3-column wide view while keeping standard mode as 1 column.

What I found
1. The feed is currently segmented into multiple masonry blocks in `HomeFeed.tsx` (`renderFeedWithShorts`), and each full-width insert forces a flush of the current cards.
2. In 3-column mode, that creates short “mini-segments” (especially the first one), so one column can be much shorter than the others before the next segment starts.
3. `MobileWhoToFollowCarousel` is inserted at item 3 even on desktop, but the component is `lg:hidden`, so it visually disappears while still splitting the masonry segment. This is a major source of early blank area.
4. Column distribution is round-robin (`i % cols`), which is not height-aware and increases imbalance when card heights vary (text vs image vs video).

Proposed fix (implementation plan)
1. Make desktop masonry a continuous flow (no mid-stream segment breaks)
- In multi-column mode (`colCount > 1`), stop injecting full-width modules inside the card flow.
- Render one continuous masonry block for feed cards to prevent artificial breaks that create blank zones.
- Keep current insertion behavior only for single-column mode (`colCount === 1`), where full-width inserts don’t cause column imbalance.

2. Prevent hidden mobile insertions from affecting desktop layout
- Gate `MobileWhoToFollowCarousel` insertion to mobile/single-column only.
- Do not flush masonry segments for content that is hidden at current breakpoint.

3. Replace round-robin with balanced column assignment
- Update distribution logic from round-robin to “shortest-column-first” assignment using estimated card height weights:
  - text posts: low weight
  - videos: medium weight
  - images: medium/high weight (higher if likely tall)
- This produces more even column heights and reduces visible empty zones between section breaks and at fold points.

4. Keep current UX constraints intact
- Standard mode remains 1 column.
- Collapsed/wide mode keeps 2–3 columns.
- Card components (PostCard/ImageCard/VideoCard) remain unchanged; only feed layout orchestration changes.

5. Verify with focused QA
- Cases to test:
  - collapsed + 2 columns
  - collapsed + 3 columns (wide desktop)
  - standard mode 1 column
  - with/without shorts/radio/live data
  - first 10 items where current issue appears most
- Confirm no early black gaps after first row and no hidden mobile component causing desktop spacing artifacts.

Files to update
- `src/components/app/feeds/HomeFeed.tsx`
  - `renderFeedWithShorts` insertion/segmentation strategy
  - insertion guards for mobile-only components
  - column distribution helper (balanced assignment)
  - masonry render path split by `colCount`

Technical details (plain-language)
- The gaps are not from card styling; they come from feed layout logic.
- Right now, the app keeps “cutting” the feed into chunks to insert full-width widgets.
- In 3-column layout, those cuts happen too early, so one column ends much sooner and looks like empty black space.
- Fix is to keep desktop masonry as one continuous stream and only insert those full-width blocks in single-column mode.

```text
Current (problem):
[3 cards] -> forced full-width break -> [next cards]
(one short column appears empty until tallest column ends)

Planned:
Desktop 3-col: one continuous masonry stream (balanced columns)
Mobile/1-col: keep full-width inserts inline as today
```

<lov-actions>
<lov-suggestion message="Test the Home feed end-to-end in collapsed 3-column mode and standard 1-column mode to verify there are no black gaps and that scrolling/inserts still behave correctly.">Verify the feed end-to-end</lov-suggestion>
<lov-suggestion message="Implement continuous desktop masonry in HomeFeed by disabling mid-stream full-width insert flushes when colCount > 1, while preserving current insert behavior for colCount === 1.">Make desktop masonry continuous</lov-suggestion>
<lov-suggestion message="Update HomeFeed column distribution from round-robin to shortest-column-first using card-type height weights so text/image/video cards balance better across 2–3 columns.">Balance columns by estimated height</lov-suggestion>
</lov-actions>
