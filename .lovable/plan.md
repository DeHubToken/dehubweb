
# Add PPV/W2E/Locked Badges to Video Thumbnails

## Overview
Add a liquid glass badge to the top-left corner of video thumbnails that displays content type (PPV, Bounty, Locked) based on API data. For PPV content, the badge will show the price and currency as returned by the API.

## Current State
- The DeHub API already returns `is_ppv`, `ppv_price`, and `is_live` fields on NFT objects
- The `VideoCard` component uses liquid glass styling for other overlays (duration badge, controls)
- The `VideoItem` type doesn't include PPV/W2E/locked fields yet
- The mapping function doesn't pass these fields through

## Implementation Plan

### 1. Extend VideoItem Interface
Add new optional fields to track content access type:
- `isPPV` - Whether content is pay-per-view
- `ppvPrice` - Price amount for PPV content
- `ppvCurrency` - Currency symbol (e.g., "USDC", "DHB")
- `isW2E` - Whether content is watch-to-earn/bounty
- `isLocked` - Whether content is subscriber-only

### 2. Update mapNFTToVideoItem Function
Map the API response fields to the new VideoItem properties:
- Map `is_ppv` to `isPPV`
- Map `ppv_price` to `ppvPrice`
- Extract currency from API response or default to "USDC"
- Check for W2E/bounty indicators
- Check for locked/subscriber-only indicators

### 3. Create Content Badge Component
Add a liquid glass badge positioned at the top-left of the video thumbnail:
- Uses the established liquid glass styling: `bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10`
- Shows appropriate icon and text based on content type
- For PPV: Display price with currency (e.g., "5.00 USDC")
- For Bounty: Display "Bounty" with gift/star icon
- For Locked: Display "Locked" with lock icon

### 4. Update VideoCard Component
Add the badge to the thumbnail area with priority logic:
- Position: `absolute top-2 left-2`
- Only show if content has one of these flags
- If multiple flags are set, show the most relevant (PPV takes priority)

---

## Technical Details

### File Changes

**src/types/feed.types.ts**
```typescript
export interface VideoItem extends BaseFeedItem {
  // ... existing fields
  
  /** Whether content is pay-per-view */
  isPPV?: boolean;
  /** PPV price amount */
  ppvPrice?: number;
  /** PPV currency (e.g., "USDC", "DHB") */
  ppvCurrency?: string;
  /** Whether content is watch-to-earn/bounty */
  isW2E?: boolean;
  /** Whether content is subscriber-only locked */
  isLocked?: boolean;
}
```

**src/hooks/use-dehub-feed.ts**
```typescript
export function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  // ... existing mapping
  
  // Map content access fields
  const isPPV = nft.is_ppv ?? false;
  const ppvPrice = nft.ppv_price;
  const ppvCurrency = 'USDC'; // Default currency, update if API provides it
  const isW2E = nft.is_w2e ?? false;
  const isLocked = nft.is_locked ?? false;
  
  return {
    // ... existing fields
    isPPV,
    ppvPrice,
    ppvCurrency,
    isW2E,
    isLocked,
  };
}
```

**src/components/app/cards/VideoCard.tsx**
```typescript
import { Lock, Gift, DollarSign } from 'lucide-react';

// Inside the thumbnail container, add:
{/* Content Type Badge - PPV/Bounty/Locked */}
{(video.isPPV || video.isW2E || video.isLocked) && (
  <div className="absolute top-2 left-2 z-10">
    {video.isPPV && video.ppvPrice ? (
      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10">
        <DollarSign className="w-3 h-3 text-white" />
        <span className="text-white text-xs font-medium">
          {video.ppvPrice.toFixed(2)} {video.ppvCurrency}
        </span>
      </div>
    ) : video.isW2E ? (
      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10">
        <Gift className="w-3 h-3 text-white" />
        <span className="text-white text-xs font-medium">Bounty</span>
      </div>
    ) : video.isLocked ? (
      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10">
        <Lock className="w-3 h-3 text-white" />
        <span className="text-white text-xs font-medium">Locked</span>
      </div>
    ) : null}
  </div>
)}
```

### Badge Priority
When multiple flags are present on the same content:
1. **PPV** (highest priority) - Shows price
2. **Bounty/W2E** - Shows bounty badge
3. **Locked** - Shows lock badge

### Visual Design
The badge follows the liquid glass design system:
- Background: `bg-black/40`
- Blur: `backdrop-blur-[24px]`
- Saturation: `saturate-[180%]`
- Border: `border border-white/10`
- Border radius: `rounded-lg`
- Padding: `px-2 py-1`
- Text: `text-white text-xs font-medium`

### Note About API Data
The API currently returns `is_ppv` and `ppv_price` fields. If the API provides additional fields for W2E or locked content in the future, the mapping can be extended. For now, these fields will be checked but may not be populated by the current API response.
