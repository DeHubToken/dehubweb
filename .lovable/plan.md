
# Fix: Post Visibility Update API - Numeric Status Values

## Problem Analysis
The DeHub API `/api/token_visibility` endpoint is rejecting our request with "Invalid data provided" error.

**What we've tried:**
- Original: `{ tokenId: 2687, visibility: "private" }` → Failed
- Change 1: `{ tokenId: 2687, status: "private" }` → Still failed

**Network request captured:**
```
POST https://api.dehub.io/api/token_visibility
Request Body: {"tokenId":2687,"status":"private"}
Response: {"result":false,"error":"Invalid data provided"}
```

## Root Cause
The API likely expects **numeric values** for visibility status rather than string values. This is a common pattern in REST APIs where:
- `0` or `1` = Public
- `1` or `2` = Private  
- `2` or `3` = Unlisted

Since the string field name changes haven't worked, the issue is almost certainly the **value format**.

---

## Proposed Fix

### Strategy
Update the `updateTokenVisibility` function to convert string visibility values to numeric codes. Try the most common mapping first:

```typescript
const visibilityMap: Record<TokenVisibility, number> = {
  'public': 0,
  'private': 1,
  'unlisted': 2,
};
```

### File to Modify
`src/lib/api/dehub.ts` (lines 2453-2481)

### Code Changes

**Current code:**
```typescript
body: JSON.stringify({
  tokenId: Number(tokenId),
  status: visibility,
}),
```

**Updated code:**
```typescript
// Convert visibility string to numeric status code
const visibilityToStatus: Record<TokenVisibility, number> = {
  'public': 0,
  'private': 1,
  'unlisted': 2,
};

body: JSON.stringify({
  tokenId: Number(tokenId),
  status: visibilityToStatus[visibility],
}),
```

---

## Alternative Mappings to Try

If `0/1/2` doesn't work, here are common alternatives:

| Pattern | Public | Private | Unlisted |
|---------|--------|---------|----------|
| Zero-indexed | 0 | 1 | 2 |
| One-indexed | 1 | 2 | 3 |
| Boolean-ish | 1 | 0 | 2 |
| Inverted | 2 | 1 | 0 |

---

## Testing Plan

1. Apply the numeric mapping change
2. Test changing visibility from Public → Private
3. If still fails, try alternative mappings (1/2/3 or 1/0/2)
4. Verify all three visibility options work (Public, Unlisted, Private)
5. Also update the batch visibility endpoint in SettingsPage.tsx to match

---

## Additional Improvement
Once the correct format is confirmed, we should also:
- Add the `visibility` field to the `DeHubNFT` interface so TypeScript knows about it
- Update the batch visibility API in SettingsPage.tsx to use the same format
