
## Add PPV/Bounty/Locked Support to Image Posts

**Problem**: Image posts that are marked as PPV in the API are shown fully visible without any blur, badge, or payment gate. This is because:
1. The `ImagePost` type has no PPV/Bounty/Locked fields
2. The `toImagePost()` mapper doesn't extract PPV data from the API
3. The `ImageCard` component has no PPV overlay, blur, or badge rendering

**Solution**: Mirror the existing PPV gating system from `VideoCard` into the image post pipeline.

---

### 1. Update `ImagePost` type (`src/types/feed.types.ts`)

Add the missing fields to the `ImagePost` interface:
- `isPPV`, `ppvPrice`, `ppvCurrency`
- `isW2E`, `isLocked`, `lockedPrice`, `lockedCurrency`
- `bountyViews`, `bountyComments`, `bountyAmount`, `bountyCurrency`

### 2. Update `toImagePost()` mapper (`src/pages/app/SinglePostPage.tsx`)

Extract PPV/Bounty/Locked fields from `streamInfo` (same logic already used in `toVideoItem()`):
- `isPPV: nft.is_ppv || streamInfo?.isPayPerView || false`
- `ppvPrice`, `ppvCurrency`, `isW2E`, `isLocked`, etc.

Also update any other `mapToImagePost` functions used in feed mappers (e.g., in `ImagesFeed.tsx` and `useDeHubImages`).

### 3. Update `ImageCard` component (`src/components/app/cards/ImageCard.tsx`)

Add PPV gating UI matching the VideoCard pattern:
- When `isPPV` is true: blur the image (`blur-lg`) and show a centered Ticket icon inside a liquid glass container
- Display PPV/Bounty/Locked badges in the top-left corner (same style as VideoCard)
- Clicking the blurred overlay opens a PPV payment drawer
- Suppress image interaction (navigation arrows, click-through) when PPV-locked

### 4. Update feed-level image mappers

Ensure all places that create `ImagePost` objects pass through PPV fields:
- `src/components/app/feeds/ImagesFeed.tsx` (both `useDeHubImages` and `useUnifiedFeed` paths)
- `src/hooks/use-dehub-images.ts` (if it maps data)
- Any other feed mapper creating `ImagePost` objects

---

### Technical Details

**PPV Locked State (ImageCard)**:
```text
+---------------------------+
|  [Blurred Image]          |
|                           |
|     +------------------+  |
|     | Ticket Icon      |  |
|     | "10 DHB"         |  |
|     +------------------+  |
|                           |
| [PPV Badge top-left]     |
+---------------------------+
```

- Blur: `blur-lg` on the image element
- Overlay: centered liquid glass container (bg-black/40, backdrop-blur-[24px], border-white/10) with Lucide `Ticket` icon
- Badge: same compact badge style as VideoCard (top-left, bg-black/40, Ticket icon)
- Click triggers PPV payment drawer (reuse existing drawer component from VideoCard)
