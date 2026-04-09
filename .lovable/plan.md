

## Plan: Build Working Fractions Marketplace

### Summary
Make the fractions system functional — users can list fractions for sale, make buy offers, accept/reject offers, and execute on-chain transfers. All marketplace state lives in database tables; actual fraction transfers happen on-chain via ERC-1155 `safeTransferFrom`.

### Current State
- Posts are ERC-1155 tokens with 1000 fractions each (contract: `0x9f8012074d27F8596C0E5038477ACB52057BC934` on Base)
- `getTokenHolders()` already queries on-chain balances
- `PostInfoPage.tsx` has placeholder UI for listings/offers tabs with "coming soon" toasts
- `ListFractionsDrawer` exists but doesn't persist anything
- No database tables for listings or offers yet

### Architecture

```text
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│  Seller UI  │───▶│  fraction_listings│◀───│  Buyer UI   │
│ (list/delist)│    │  fraction_offers  │    │(offer/buy)  │
└─────────────┘    └──────────────────┘    └─────────────┘
                           │
                    On accept/buy:
                           ▼
                   ┌───────────────┐
                   │ ERC-1155      │
                   │safeTransferFrom│
                   │ + DHB payment │
                   └───────────────┘
```

### Step 1: Create Database Tables

**`fraction_listings`** — seller lists fractions at a fixed price:
- `id`, `token_id` (NFT), `chain_id`, `seller_address`, `quantity`, `price_per_fraction` (DHB), `status` (active/sold/cancelled), `created_at`
- RLS: anyone can SELECT; seller can INSERT/UPDATE/DELETE their own

**`fraction_offers`** — buyer makes an offer on a token's fractions:
- `id`, `token_id`, `chain_id`, `buyer_address`, `quantity`, `price_per_fraction` (DHB), `status` (pending/accepted/rejected/cancelled/completed), `target_seller` (optional — can target a specific listing/holder or be open), `tx_hash`, `created_at`
- RLS: anyone can SELECT; buyer can INSERT their own; seller (holder) can UPDATE status

**`fraction_trades`** — completed trade log:
- `id`, `token_id`, `chain_id`, `seller_address`, `buyer_address`, `quantity`, `price_per_fraction`, `total_dhb`, `tx_hash`, `created_at`
- RLS: anyone can SELECT; INSERT via service or open

### Step 2: On-Chain Transfer Logic

Create `src/lib/contracts/fraction-transfer.ts`:

1. **`transferFractions(tokenId, from, to, amount, chainId)`** — calls `safeTransferFrom` on the ERC-1155 contract via `writeContractAA`
2. **Buy flow**: Buyer sends DHB to seller (`sendERC20Token`), then seller's fractions are transferred. Since we can't do atomic swaps without an escrow contract, the flow will be:
   - Buyer pays DHB to seller → tx confirmed
   - Fraction transfer is initiated (seller must approve or it's done via the listing acceptance flow)

**Practical approach without escrow**: Use a "claim" model:
- **Direct buy from listing**: Buyer pays DHB to seller, then calls `safeTransferFrom` (seller must have set approval on the marketplace or we use the seller's session)
- **Offer model**: Seller accepts offer → triggers DHB transfer from buyer (buyer pre-approves) + fraction transfer from seller

Given the AA wallet architecture, the simplest working approach:
- Listings: seller pre-approves the contract. Buyer pays DHB + fractions auto-transfer via edge function with platform key (custodial settlement), OR
- **Simpler v1**: Both parties must be online. Seller lists → buyer buys → two sequential transactions (DHB payment + fraction claim) with status tracked in DB

**Recommended v1**: Seller lists fractions. Buyer clicks "Buy" → sends DHB to seller → records trade in DB → seller sees "Pending Transfer" → seller confirms transfer of fractions. If seller doesn't transfer within 48h, DHB is refundable (tracked in DB, manual resolution).

### Step 3: Update PostInfoPage UI

**Listings tab**:
- Show active listings with seller address, quantity, price/fraction, total cost
- "Buy" button on each listing → opens drawer to confirm purchase
- "List Your Fractions" button for holders → existing drawer, now persists to `fraction_listings`
- "Cancel Listing" for your own listings

**Offers tab**:
- Show pending offers with buyer address, quantity, offered price
- "Make Offer" button → drawer with quantity + price inputs → saves to `fraction_offers`
- For holders: "Accept" / "Reject" buttons on incoming offers
- "Cancel Offer" for your own pending offers

**Buy flow (from listing)**:
1. Buyer clicks "Buy" on a listing
2. Confirmation drawer shows total DHB cost
3. Buyer sends DHB to seller via `sendERC20Token`
4. DB updates listing status, creates trade record
5. Toast: "Payment sent! Seller will transfer fractions."
6. Seller sees notification to transfer fractions

**Offer flow**:
1. Buyer submits offer (saved to DB)
2. Holder sees offer in "Offers" tab
3. Holder clicks "Accept" → triggers buyer's DHB transfer (buyer must have pre-approved) + holder sends fractions
4. Trade recorded

### Step 4: Real-time Updates

Enable realtime on `fraction_listings` and `fraction_offers` tables so the marketplace updates live when new listings/offers appear.

### Step 5: Notifications

Insert into `custom_notifications` when:
- Someone makes an offer on your fractions
- Your offer is accepted/rejected
- Someone buys your listing

### Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create 3 tables + RLS policies |
| `src/lib/contracts/fraction-transfer.ts` | New — ERC-1155 safeTransferFrom wrapper |
| `src/hooks/use-fraction-marketplace.ts` | New — queries/mutations for listings & offers |
| `src/pages/app/PostInfoPage.tsx` | Update — wire up real data, buy/sell flows |
| `src/components/app/fractions/BuyFractionDrawer.tsx` | New — confirm purchase UI |
| `src/components/app/fractions/MakeOfferDrawer.tsx` | New — submit offer UI |

