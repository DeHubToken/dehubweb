

## DeHub API Audit — Current State vs Live API

### Summary of Findings

After comparing all 18 API modules against live API responses, here's what's new, changed, or missing:

---

### 1. New Fields in Feed/NFT Responses (NOT in our types)

The live `/api/feed` endpoint now returns these fields that our `DeHubNFT` type doesn't include:

- **`isQuotePost`** (boolean) — whether the post is a quote post
- **`quotedTokenId`** (number | null) — the token ID being quoted
- **`quotedPost`** (nested DeHubNFT object) — full embedded quoted post data
- **`reposts`** (number) — repost count
- **`quotes`** (number) — quote count
- **`ppvBuyerCount`** (number) — pay-per-view buyer count
- **`isHidden`** (boolean) — content visibility flag (already partially handled but not in type)
- **`isDeleted`** (boolean) — soft-delete flag
- **`minterStaked`** (number) — minter's staked amount

### 2. Feed Mapping Gaps

All feed mappers (`use-unified-feed.ts`, `SinglePostPage.tsx`, `use-bookmarks.ts`, `HomeFeed.tsx`) hardcode `reposts: 0` instead of reading `item.totalReposts` or the new `item.reposts` field. The API now provides this data.

### 3. Quote Post / Repost Feature

The API now fully supports quote posts with embedded `quotedPost` data. Our UI has repost/quote buttons but they show a "Bug reported, fix will be live soon!" toast. The API infrastructure is ready to support this feature now.

### 4. DPay/Price Response Shape Change

Our type expects `{ price: number; change_24h: number }` but the live API returns:
```json
{ "price": 0.000591, "tokenSymbol": "DHB", "currency": "usd" }
```
No `change_24h` field — it has `tokenSymbol` and `currency` instead. This won't break (we just get `undefined` for `change_24h`) but the type is inaccurate.

### 5. Available Tokens Response Shape Change

Our type expects `DPayToken[]` but the live API returns:
```json
{ "balance": { "8453": { "DHB": 1438.59 } } }
```
This is a completely different shape — the `getAvailableTokens()` function likely returns incorrect data.

### 6. Server Time Response

API returns `{ status: true, data: 1772131592, note: "s" }` but our function expects `{ time: string }`. The actual time is in `data` as a unix timestamp, not `time` as a string.

### 7. Pagination in Feed

Feed now returns structured pagination: `{ pagination: { page, limit, totalCount, totalPages, hasMore } }`. Our `searchNFTs` already handles this correctly.

### 8. Categories Response

Returns a flat string array — our handler already handles this correctly.

---

### Recommended Implementation Plan

**Step 1: Update `DeHubNFT` type** — Add `isQuotePost`, `quotedTokenId`, `quotedPost`, `reposts`, `quotes`, `ppvBuyerCount`, `isHidden`, `isDeleted`, `minterStaked` fields.

**Step 2: Fix feed mappers** — Replace hardcoded `reposts: 0` with `item.totalReposts || item.reposts || 0` across all feed mappers.

**Step 3: Fix `getDHBPrice` return type** — Update to match actual API response shape (`tokenSymbol`, `currency` instead of `change_24h`).

**Step 4: Fix `getAvailableTokens`** — Update to handle the `{ balance: { chainId: { symbol: amount } } }` response shape.

**Step 5: Fix `getServerTime`** — Update to read `data` field (unix timestamp) instead of `time` (string).

**Step 6: Enable quote post display** — Use `quotedPost` data to render embedded quoted posts in the feed (the API now provides full nested post data).

