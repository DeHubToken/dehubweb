

# Fix: PPV and Locked Filters Crash Site

## Root Cause Identified

When clicking PPV/Locked filters, the app crashes with:
```
TypeError: video.ppvPrice.toFixed is not a function
```

The API returns `payPerViewAmount` as **strings sometimes** (e.g., `"500"`) and **numbers other times** (e.g., `1`). The VideoCard component calls `.toFixed(2)` on this value, which crashes when it's a string.

Evidence from API response:
```json
// Sometimes a number:
"payPerViewAmount": 1

// Sometimes a string:
"payPerViewAmount": "500"
```

## Solution

### 1. Fix the Data Mapper (`src/hooks/use-unified-feed.ts`)

**Line 183** - Convert to number when mapping:

```typescript
// Before:
ppvPrice: item.streamInfo?.payPerViewAmount,

// After:
ppvPrice: Number(item.streamInfo?.payPerViewAmount) || undefined,
```

### 2. Add Defensive Check in VideoCard (`src/components/app/cards/VideoCard.tsx`)

**Line 464** - Ensure we always call toFixed on a number:

```typescript
// Before:
{video.ppvPrice.toFixed(2)} {video.ppvCurrency || 'USDC'}

// After:
{Number(video.ppvPrice).toFixed(2)} {video.ppvCurrency || 'USDC'}
```

### 3. Update Interface Types (`src/hooks/use-unified-feed.ts`)

**Lines 65-67** - Reflect that API may return strings:

```typescript
streamInfo?: {
  isLockContent: boolean;
  lockContentAmount?: number | string;  // API returns string sometimes
  isPayPerView: boolean;
  payPerViewAmount?: number | string;   // API returns string sometimes
  // ... rest unchanged
};
```

## Summary of Changes

| File | Line | Change |
|------|------|--------|
| `src/hooks/use-unified-feed.ts` | 65-67 | Update interface to `number \| string` for lock/ppv amounts |
| `src/hooks/use-unified-feed.ts` | 183 | Add `Number()` wrapper for `payPerViewAmount` |
| `src/components/app/cards/VideoCard.tsx` | 464 | Add `Number()` wrapper before `.toFixed()` |

## Result

After this fix:
- PPV filter works without crashing
- Locked filter works without crashing
- PPV badge displays correctly: "500.00 DHB" instead of crashing

