

# PPV Purchase Counter

## Overview
Track PPV content purchases by recording each successful payment in a local database table, then displaying the purchase count on PPV posts. Since the DeHub API doesn't expose a purchase count endpoint, we'll maintain our own ledger after each confirmed on-chain transaction.

## How It Works

1. After a successful DHB token transfer (already handled in `use-ppv-payment.ts`), we record the purchase in a new `ppv_purchases` table
2. Purchase counts are fetched and displayed on PPV post cards (both Video and Image)
3. Creators can see how many times their PPV content has been purchased

## Technical Details

### 1. New Database Table: `ppv_purchases`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| token_id | text | The post/NFT token ID |
| buyer_address | text | Wallet address of purchaser |
| creator_address | text | Wallet address of creator |
| amount | numeric | Price paid |
| currency | text | Token symbol (DHB) |
| chain_id | integer | Blockchain chain ID |
| tx_hash | text | On-chain transaction hash |
| created_at | timestamptz | Purchase timestamp |

- Unique constraint on `(token_id, buyer_address)` to prevent duplicate records
- RLS: anyone can read (for counts), only the buyer's wallet can insert

### 2. Record Purchase After Payment

In `src/hooks/use-ppv-payment.ts`, after the successful `result.wait(1)` call, insert a row into `ppv_purchases` with the transaction hash and details.

### 3. New Hook: `usePPVPurchaseCount`

A small hook that queries `ppv_purchases` to get the count for a given `token_id`. Uses a simple `select count(*)` query, cached via React Query.

### 4. Display Count on PPV Cards

Add a small purchase count badge (e.g., "12 unlocks") near the PPV price overlay on `VideoCard.tsx` and `ImageCard.tsx`. Only shown when count > 0.

### 5. Check If Already Purchased

The unique constraint on `(token_id, buyer_address)` also enables a quick "already unlocked" check, which could be used to skip the payment flow for repeat views.

