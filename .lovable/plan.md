

# Bounty Details Feature

## Overview
When users tap the bounty badge on video content, a drawer will slide up showing the bounty details: how many views/comments are rewarded and the total reward pool.

## Current State
- The API returns `streamInfo.isAddBounty: boolean` - we know this is just a flag
- The bounty badge currently just shows "Bounty" with a Gift icon
- The API apparently has more detailed bounty data that isn't being captured

## Implementation

### 1. Extend API Types
Update the `streamInfo` interface in `use-unified-feed.ts` to include bounty fields:
- `bountyViews` - number of viewers to reward
- `bountyComments` - number of commenters to reward  
- `bountyAmount` - total reward pool
- `bountyCurrency` - DHB or USD

### 2. Extend VideoItem Type
Add bounty detail fields to `VideoItem` in `feed.types.ts`:
- `bountyViews?: number`
- `bountyComments?: number`
- `bountyAmount?: number`
- `bountyCurrency?: string`

### 3. Update Data Mapper
Modify `mapToVideoItem` in `use-unified-feed.ts` to extract bounty details from the API response and map them to the new fields.

### 4. Create Bounty Details Drawer
In `VideoCard.tsx`:
- Make the bounty badge tappable/clickable
- On tap, show a Drawer with bounty details:
  - Title: "Bounty Rewards"
  - Row showing Eye icon + "First X views" 
  - Row showing MessageCircle icon + "First Y comments"
  - Total reward pool: "X DHB" with DHB coin icon
  - Brief explanation: "Watch and engage to earn rewards!"

### 5. UI Design
The drawer will use the existing liquid glass aesthetic:
- Semi-transparent background with blur
- White/10 borders
- DHB coin icon for the reward display
- Consistent with existing Options drawer styling

---

## Technical Details

### Files to Modify

**`src/types/feed.types.ts`**
Add to VideoItem interface:
```typescript
/** Bounty: number of viewers to reward */
bountyViews?: number;
/** Bounty: number of commenters to reward */
bountyComments?: number;
/** Bounty: total reward amount */
bountyAmount?: number;
/** Bounty: reward currency (DHB, USD) */
bountyCurrency?: string;
```

**`src/hooks/use-unified-feed.ts`**
Extend streamInfo interface with bounty fields and update mapToVideoItem to extract them.

**`src/components/app/cards/VideoCard.tsx`**
- Add state for bounty drawer visibility
- Wrap bounty badge in a button that opens the drawer
- Add BountyDetailsDrawer component with the reward breakdown

### Drawer Content Structure
```text
┌─────────────────────────────────┐
│         Bounty Rewards          │
├─────────────────────────────────┤
│ 👁  First 100 views get rewarded│
│ 💬 First 50 comments get rewarded│
├─────────────────────────────────┤
│ Total Pool: 🪙 500 DHB          │
├─────────────────────────────────┤
│ Watch and engage to earn!       │
└─────────────────────────────────┘
```

