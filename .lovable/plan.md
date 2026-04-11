

# Stores Feature — Full Plan

## Overview
A peer-to-peer marketplace where any user can list physical or digital items for sale on their profile. Buyers browse, message, and transact — with DHB as the native payment rail on Base chain.

## Database Schema (3 new tables)

### `stores` — One per user
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| wallet_address | text NOT NULL | Owner, unique |
| name | text | Store display name |
| description | text | |
| banner_url | text | |
| avatar_url | text | |
| is_active | boolean | Default true |
| created_at / updated_at | timestamptz | |

### `store_listings` — Individual items
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| store_id | uuid FK → stores | |
| wallet_address | text | Seller (denormalized for RLS) |
| title | text NOT NULL | |
| description | text | |
| price | numeric NOT NULL | In DHB |
| currency | text | Default 'DHB' |
| category | text | e.g. 'digital', 'merch', 'art', 'service', 'other' |
| images | jsonb | Array of image URLs (up to 5) |
| status | text | 'active' / 'sold' / 'draft' / 'archived' |
| stock_quantity | integer | NULL = unlimited, 0 = sold out |
| is_digital | boolean | Default false |
| digital_file_url | text | For digital goods (gated) |
| condition | text | 'new' / 'used' / 'like_new' |
| shipping_info | text | Free-text shipping details |
| created_at / updated_at | timestamptz | |

### `store_orders` — Purchase records
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| listing_id | uuid FK → store_listings | |
| buyer_address | text NOT NULL | |
| seller_address | text NOT NULL | |
| amount | numeric | DHB paid |
| tx_hash | text | On-chain proof |
| status | text | 'pending' / 'paid' / 'shipped' / 'completed' / 'disputed' / 'cancelled' |
| shipping_address | text | Encrypted or free-text |
| notes | text | Buyer message |
| created_at / updated_at | timestamptz | |

### RLS policies
- Listings: public SELECT; owner INSERT/UPDATE/DELETE by wallet.
- Orders: buyer or seller can SELECT their own; buyer can INSERT; both can UPDATE status.
- Stores: public SELECT; owner INSERT/UPDATE/DELETE.

## Frontend Architecture

### 1. New route: `/app/stores`
- Add to `NAV_ITEMS` with `Store` icon
- Register in `App.tsx` routes and `PersistentPageCache`
- **StoresPage** — Two tabs: "Browse" (all active listings grid) and "My Store" (seller dashboard)

### 2. Browse tab
- Grid of `StoreListingCard` components (image, title, price in DHB, seller avatar)
- Category filter chips (All, Digital, Merch, Art, Services)
- Search bar
- Sort: Newest, Price Low→High, Price High→Low

### 3. My Store tab (requires auth)
- "Set Up Store" one-time flow if no store exists (name, description, banner upload)
- Listings management: add / edit / archive / mark as sold
- Orders received: list with status badges, mark shipped/completed
- My purchases: orders placed as buyer

### 4. Create/Edit Listing Drawer
- Title, description, price (DHB), category dropdown, condition
- Up to 5 image uploads (to `community-media` or new `store-media` bucket)
- Stock quantity toggle (limited vs unlimited)
- Digital item toggle → file upload field
- Shipping info free-text
- Save as draft or publish

### 5. Listing Detail Drawer
- Image carousel, seller info with link to profile
- "Buy Now" button → sends DHB on-chain to seller, records order
- "Message Seller" → opens DM
- Stock/availability indicator

### 6. Profile integration
- Add a "Store" tab on user profiles showing their active listings
- Link from listing cards to seller's profile

### 7. Notifications
- Notify seller on new order (`store_order` type in `custom_notifications`)
- Notify buyer on status change (shipped, completed)

## Payment Flow
1. Buyer clicks "Buy Now" → DHB transfer via `sendERC20Token` (same pattern as tips)
2. On tx success → insert into `store_orders` with tx_hash
3. Seller sees order in "My Store" → marks shipped → buyer confirms receipt → completed
4. Dispute flow: buyer can flag within 7 days (future enhancement)

## Storage
- New bucket `store-media` (public) for listing images and digital file uploads

## Files to create/modify
- **Create**: `src/pages/app/StoresPage.tsx`
- **Create**: `src/components/app/stores/` — StoreListingCard, CreateListingDrawer, ListingDetailDrawer, MyStoreTab, BrowseTab, SetupStoreFlow, OrdersList
- **Create**: `src/hooks/use-stores.ts` — queries for listings, orders, store
- **Modify**: `src/constants/app.constants.ts` — add nav item
- **Modify**: `src/App.tsx` — add route
- **Modify**: `src/components/app/PersistentPageCache.tsx` — add cached page
- **Migration**: 3 tables + RLS + realtime on `store_orders`
- **Storage bucket**: `store-media`

## Implementation order
1. Database migration (tables, RLS, realtime)
2. Storage bucket
3. Hooks and types
4. StoresPage with Browse + My Store tabs
5. Create/Edit listing drawer
6. Listing detail drawer with buy flow
7. Order management UI
8. Notifications trigger
9. Profile store tab integration
10. Nav item + routing

