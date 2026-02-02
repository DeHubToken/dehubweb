
# Fix: Badge System Using Wrong Field (Staked vs Holdings)

## Problem Identified

The badge system is showing incorrect tiers because:

1. **Wrong field being used**: The badge is calculated from `entry.staked` but the screenshot clearly shows badges are based on **$DHB token holdings** (which is `entry.total`)
2. **Data mismatch example**: User "7RB" displays 50.9M DHB (their `total` holdings) but their `staked` is only 6.78M. The badge is showing based on 6.78M instead of 50.9M

## Root Cause

In `LeaderboardPage.tsx` line 312:
```tsx
{getBadgeUrl(entry.staked) && (
```

Should be:
```tsx
{getBadgeUrl(entry.total) && (
```

The UI displays `total` holdings but passes `staked` to the badge function. Since many users have significantly less staked than their total holdings, they appear at lower tiers.

## Solution

Update all badge references to use **total holdings** instead of **staked amount**:

### File Changes

| File | Change |
|------|--------|
| `src/pages/app/LeaderboardPage.tsx` | Use `entry.total` instead of `entry.staked` for badge calculation |
| `src/lib/staking-badges.ts` | Rename functions and comments to clarify this is "holdings-based" not "staking-based" |
| `src/pages/app/ProfilePage.tsx` | Verify using correct holdings field (may need adjustment) |
| `src/components/app/cards/CardHeader.tsx` | Verify using correct holdings field (may need adjustment) |

### Code Changes

**LeaderboardPage.tsx**
```tsx
// Before
{getBadgeUrl(entry.staked) && (
  <img src={getBadgeUrl(entry.staked)!} ... />
)}

// After  
{getBadgeUrl(entry.total) && (
  <img src={getBadgeUrl(entry.total)!} ... />
)}
```

**staking-badges.ts** (documentation update)
```typescript
/**
 * Holdings Badge Utility
 * ======================
 * Determines user tier badges based on DHB token holdings (total balance).
 * NOT based on staked amount - uses total holdings including liquid + staked.
 */
```

### Verification

After fix, users should show badges matching their displayed holdings value:
- 50M+ DHB holdings → Megalodon
- 25M+ DHB holdings → Blue Whale  
- 10M+ DHB holdings → Great White Shark
- etc.

### Additional Consideration

For Profile and Feed cards, need to verify which field is available:
- Feed responses have `minterStaked` - may need to also fetch total holdings
- Profile pages may need to use total balance from account info API

This may require additional changes to ensure consistency across the entire app.
