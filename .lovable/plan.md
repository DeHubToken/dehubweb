

# Fix: Missing Lock Amount on Home Feed Video Cards

## Problem Identified
The home page (`/app`) uses the `use-unified-feed.ts` hook to fetch content, but this hook is **not mapping the lock amount** from the API response. The API returns lock pricing data inside `streamInfo.lockAmount`, but the mapper only extracts `isLockContent` (the boolean flag) and ignores the actual price.

This is why the lock icon appears (because `isLocked` is correctly set) but no price is shown next to it.

## Root Cause
In `src/hooks/use-unified-feed.ts`, the `mapToVideoItem` function (lines 158-201) is missing these two properties in the return object:
- `lockedPrice` (should come from `item.streamInfo?.lockAmount`)
- `lockedCurrency` (should default to `'DHB'`)

## Solution

### File: `src/hooks/use-unified-feed.ts`

Add the missing locked content properties to the `mapToVideoItem` return object:

```typescript
return {
  // ... existing properties ...
  isLocked,
  lockedPrice: item.streamInfo?.lockAmount,      // ADD THIS
  lockedCurrency: 'DHB',                          // ADD THIS
  bountyViews: Number(item.streamInfo?.addBountyFirstXViewers) || undefined,
  // ... rest of properties ...
};
```

---

## Technical Details

The API `streamInfo` object structure (already defined in the hook's interface):
```typescript
streamInfo?: {
  isLockContent: boolean;     // ✓ Already mapped as isLocked
  lockAmount?: number;        // ✗ NOT mapped - this is the fix
  // ... other fields
};
```

The `VideoItem` type already supports these fields (from `src/types/feed.types.ts`):
```typescript
lockedPrice?: number;
lockedCurrency?: string;
```

The `VideoCard` component already handles display (lines 555-558):
```typescript
{video.lockedPrice && video.lockedPrice > 0 
  ? `${Number(video.lockedPrice).toFixed(2)} ${video.lockedCurrency || 'DHB'}` 
  : ''}
```

So the only missing piece is the data mapping in the unified feed hook.

