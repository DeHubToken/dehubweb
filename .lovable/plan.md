
# Fix "0y" Time Display Bug

## Problem
Posts that are between 360-364 days old display as "0y" instead of "12mo". This is a logic bug in the `formatTimeAgo` function.

## Root Cause
The time formatting logic has a gap:
- `diffMonths = Math.floor(364 days / 30) = 12`
- The condition `if (diffMonths < 12)` is **false** when diffMonths is exactly 12
- It falls through to `return ${diffYears}y` where `diffYears = Math.floor(364 / 365) = 0`
- Result: "0y"

## Solution
Change the condition from `< 12` to `<= 12` so that 12 months displays as "12mo" instead of falling through to years.

Alternatively, use a more robust approach: only show years when diffYears >= 1.

## Files to Update

### 1. `src/hooks/use-unified-feed.ts` (Line 146)
```typescript
// Before
if (diffMonths < 12) return `${diffMonths}mo`;
return `${diffYears}y`;

// After
if (diffYears < 1) return `${diffMonths}mo`;
return `${diffYears}y`;
```

### 2. `src/hooks/use-dehub-feed.ts` (Line 83)
Same fix - the function is duplicated in both files:
```typescript
// Before
if (diffMonths < 12) return `${diffMonths}mo`;
return `${diffYears}y`;

// After  
if (diffYears < 1) return `${diffMonths}mo`;
return `${diffYears}y`;
```

## Technical Explanation
By checking `diffYears < 1` instead of `diffMonths < 12`, we ensure:
- 11 months → "11mo"
- 12 months (360 days) → "12mo"  
- 13 months (390 days) → "13mo" (still less than 1 year)
- 365+ days → "1y", "2y", etc.

This eliminates the edge case where content is almost a year old but shows as "0y".
