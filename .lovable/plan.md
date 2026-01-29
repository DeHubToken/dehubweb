
# Fix: Bounty Details Not Showing Due to Field Name Mismatch

## Root Cause Identified

The API returns bounty data using different field names than what the code expects:

| What API Returns | What Code Reads |
|-----------------|-----------------|
| `addBountyFirstXViewers` | `bountyViews` |
| `addBountyFirstXComments` | `bountyComments` |
| `addBountyAmount` | `bountyAmount` |
| `addBountyTokenSymbol` | `bountyCurrency` |

Example from "The Island" video API response:
```json
"streamInfo": {
  "isAddBounty": true,
  "addBountyFirstXViewers": 15,
  "addBountyFirstXComments": 15,
  "addBountyAmount": 7500,
  "addBountyTokenSymbol": "DHB"
}
```

The mapper reads `item.streamInfo?.bountyViews` which returns `undefined`, so the drawer shows nothing.

---

## Solution

Update the `streamInfo` interface and mapper in `use-unified-feed.ts` to use the correct API field names.

---

## Implementation Details

### File: `src/hooks/use-unified-feed.ts`

**1. Update the streamInfo interface (lines 63-73):**

Change from:
```typescript
streamInfo?: {
  isLockContent: boolean;
  lockAmount?: number;
  isPayPerView: boolean;
  payPerViewAmount?: number;
  isAddBounty: boolean;
  bountyViews?: number;
  bountyComments?: number;
  bountyAmount?: number;
  bountyCurrency?: string;
};
```

To:
```typescript
streamInfo?: {
  isLockContent: boolean;
  lockAmount?: number;
  isPayPerView: boolean;
  payPerViewAmount?: number;
  isAddBounty: boolean;
  addBountyFirstXViewers?: number | string;
  addBountyFirstXComments?: number | string;
  addBountyAmount?: number;
  addBountyTokenSymbol?: string;
  addBountyChainId?: number;
};
```

Note: API sometimes returns these as strings (e.g., `"69"` instead of `69`), so we handle both.

**2. Update the mapToVideoItem function (lines 186-189):**

Change from:
```typescript
bountyViews: item.streamInfo?.bountyViews,
bountyComments: item.streamInfo?.bountyComments,
bountyAmount: item.streamInfo?.bountyAmount,
bountyCurrency: item.streamInfo?.bountyCurrency || 'DHB',
```

To:
```typescript
bountyViews: Number(item.streamInfo?.addBountyFirstXViewers) || undefined,
bountyComments: Number(item.streamInfo?.addBountyFirstXComments) || undefined,
bountyAmount: item.streamInfo?.addBountyAmount,
bountyCurrency: item.streamInfo?.addBountyTokenSymbol || 'DHB',
```

Using `Number()` ensures string values like `"69"` are converted to numbers.

---

## Result

After this fix, the Bounty drawer for "The Island" video will correctly display:
- "First 15 views get rewarded"
- "First 15 comments get rewarded"  
- "Total Reward Pool: 7,500 DHB"
