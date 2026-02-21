

## Fix: Follow Suggestions Not Loading More

### Root Cause

The console log reveals the issue:
```
[Suggestions] Got 10 suggested accounts (page 1, hasMore: false)
```

The component requests 15 items (`BATCH_SIZE = 15`), but the API only returns 10. Since `10 < 15`, the code concludes there are no more pages (`hasMore: false`), so infinite scroll never triggers.

The API likely caps results at 10 regardless of the requested limit.

### Solution

1. **Change `BATCH_SIZE` from 15 to 10** in `WhoToFollow.tsx` -- this matches what the API actually returns per page, so `items.length === limit` will be `true` and `hasMore` will correctly be set to `true` when there are more pages.

2. **Do the same in `MobileWhoToFollowCarousel.tsx`** for consistency.

### Technical Details

**Files to change:**
- `src/components/app/WhoToFollow.tsx` -- line 13: change `BATCH_SIZE = 15` to `BATCH_SIZE = 10`
- `src/components/app/mobile/MobileWhoToFollowCarousel.tsx` -- line 14: change `BATCH_SIZE = 15` to `BATCH_SIZE = 10`

No other changes needed. The infinite scroll handler and `useInfiniteQuery` setup are already correct -- they just never fire because `hasMore` is always `false` due to the batch size mismatch.

