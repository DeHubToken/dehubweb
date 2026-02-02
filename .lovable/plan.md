
# Fix: Post Visibility Update API Mismatch

## Problem Analysis
When changing post visibility from the Post Info page, the API returns:
```json
{"result":false,"error":"Invalid data provided"}
```

The current request sends:
```json
{"tokenId":2687,"visibility":"private"}
```

## Root Cause
The DeHub API `/api/token_visibility` endpoint expects a different request format than what we're sending. Based on common API patterns and the error message, the issue is likely one of these:

1. **Field name mismatch**: The API may expect `status` instead of `visibility`
2. **Value format mismatch**: The API may expect numeric values (e.g., `0`, `1`, `2`) instead of strings
3. **Case sensitivity**: The API may expect different casing

## Proposed Fix
Update the `updateTokenVisibility` function in `src/lib/api/dehub.ts` to match the API's expected format. The most likely fix based on similar APIs is:

### Change 1: Update Request Body Format
```typescript
// Current (not working):
body: JSON.stringify({
  tokenId: Number(tokenId),
  visibility,
}),

// Fixed - try with 'status' field name:
body: JSON.stringify({
  tokenId: Number(tokenId),
  status: visibility,
}),
```

### Change 2: If status field doesn't work, try numeric values
Some APIs use numeric visibility codes:
- `0` = public
- `1` = private  
- `2` = unlisted

```typescript
const visibilityMap: Record<TokenVisibility, number> = {
  'public': 0,
  'private': 1,
  'unlisted': 2,
};

body: JSON.stringify({
  tokenId: Number(tokenId),
  status: visibilityMap[visibility],
}),
```

---

## Technical Implementation

### File to Modify
- `src/lib/api/dehub.ts` (lines 2463-2473)

### Testing Plan
1. First try changing `visibility` → `status` field name
2. If that fails, try numeric status values
3. Verify the API response contains the updated visibility
4. Test on Post Info page with all three visibility options (Public, Unlisted, Private)

---

## Notes
- The fix requires testing against the live API to determine the exact expected format
- Once the correct format is identified, we should also update the batch visibility endpoint in `SettingsPage.tsx` to match
- The `DeHubNFT` interface should be updated to include the `visibility` field once we confirm the API response format
