

## Fix: PPV Payments Always Show "DHB on Base" Regardless of Selected Chain

### Problem

When a post is minted on BNB chain (56), the PPV payment drawer still says "DHB on Base" and processes the payment on Base. This happens because:

1. The `VideoItem` type has no `chainId` field
2. The `mapNFTToVideoItem` mapper ignores the NFT's `chainId` field (which exists on `DeHubNFT` at line 157)
3. `PPVDrawerContent` doesn't accept or pass a `chainId` prop
4. `usePPVPayment` defaults to `BASE_CHAIN_ID` when no `chainId` is provided

### Solution

Thread the post's `chainId` through the entire PPV pipeline so payments execute on the correct chain.

### Changes

**1. `src/types/feed.types.ts`** -- Add `chainId` to `VideoItem` and `ImagePost`
- Add optional `chainId?: number` field to both interfaces

**2. `src/hooks/use-dehub-feed.ts`** -- Map `chainId` from NFT data
- In `mapNFTToVideoItem`: extract `nft.chainId` and include it in the returned object
- In `mapNFTToImagePost`: same change

**3. `src/components/app/cards/PPVDrawerContent.tsx`** -- Accept and pass `chainId`
- Add `chainId?: number` to `PPVDrawerContentProps`
- Pass it through to `usePPVPayment`

**4. `src/components/app/cards/VideoCard.tsx`** -- Pass `chainId` to PPV drawer
- Where `PPVDrawerContent` is rendered, add `chainId={video.chainId}` (there are two VideoCard components in this file -- the compact one and the full one, both need updating)

**5. Any other card components rendering `PPVDrawerContent`** -- Same pattern: pass through the item's `chainId`

**6. `src/hooks/use-bookmarks.ts`** -- Map `chainId` in bookmark mappers
- Include `chainId: nft.chainId` in the bookmark video/image mappers

**7. `src/components/app/feeds/MusicFeed.tsx`** -- Map `chainId` in its local mapper
- Include `chainId: nft.chainId` in `mapNFTToVideoItem`

This ensures PPV payments execute on whichever chain the content was originally minted on (Base or BNB), using the correct DHB token contract address for that chain.
