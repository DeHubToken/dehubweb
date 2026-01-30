
# Fix: Lock Amount Not Showing on Video Cards

## Problem Summary
Locked video cards only show the lock icon but not the unlock price. The lock icon appears correctly (because `isLocked` works), but no price is displayed next to it.

## Root Cause Analysis
The API returns lock pricing data inside `streamInfo` with the field name `lockContentAmount`, but the code is looking for `lockAmount`.

**API Response:**
```json
"streamInfo": {
  "isLockContent": true,
  "lockContentAmount": 10,
  "lockContentTokenSymbol": "DHB"
}
```

**Current Code (wrong):**
```typescript
lockedPrice: item.streamInfo?.lockAmount
```

**Should Be:**
```typescript
lockedPrice: item.streamInfo?.lockContentAmount
```

---

## Solution

### File: `src/hooks/use-unified-feed.ts`

#### Change 1: Fix the interface (around line 65)
Update the `UnifiedFeedItem` interface to match the actual API field name:

**Before:**
```typescript
streamInfo?: {
  isLockContent: boolean;
  lockAmount?: number;
  // ...
};
```

**After:**
```typescript
streamInfo?: {
  isLockContent: boolean;
  lockContentAmount?: number;
  lockContentTokenSymbol?: string;
  // ...
};
```

#### Change 2: Fix the mapping (around lines 196-197)
Update the `mapToVideoItem` function to use the correct field:

**Before:**
```typescript
lockedPrice: item.streamInfo?.lockAmount,
lockedCurrency: 'DHB',
```

**After:**
```typescript
lockedPrice: item.streamInfo?.lockContentAmount,
lockedCurrency: item.streamInfo?.lockContentTokenSymbol || 'DHB',
```

---

## Technical Details

The `streamInfo` object in the API response uses these field names:
- `isLockContent` → boolean flag (working correctly)
- `lockContentAmount` → the price to unlock
- `lockContentTokenSymbol` → the currency ("DHB")

After this fix, locked videos will show the price next to the lock icon (e.g., "🔒 10.00 DHB").
