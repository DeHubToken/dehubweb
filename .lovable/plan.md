
## Root Cause: API Response Structure Mismatch in `searchUsersForDM`

The search was already broken before the group chat fix. The console logs confirm it:

```
[DM API] searchUsersForDM response: { "status": true, "accounts": { "items": [...7 results...], "pagination": {...} } }
[DM API] searchUsersForDM returning { "count": 0 }
```

The API returns `response.accounts.items` (an object with a nested `items` array), but the parsing code only checks for `response.accounts` being a flat array. Since `accounts` is an object, all four conditions fail and the results are silently discarded.

The existing checks (in order):
1. `response?.result?.accounts` — no, API has no `result` wrapper here
2. `response?.accounts` as array — no, it's an object `{ items: [...], pagination: {...} }`
3. `response?.result` as array — no
4. `response` as array — no

None match, so `items` returns empty every time.

---

## The Fix — `src/lib/api/dehub/dm.ts`

Add the correct check for `response.accounts.items` as the **first** condition (highest priority, since it's the actual API shape):

```typescript
if (response?.accounts?.items && Array.isArray(response.accounts.items)) {
  accounts = response.accounts.items;                         // ← ADD THIS FIRST
} else if (response?.result?.accounts && Array.isArray(response.result.accounts)) {
  accounts = response.result.accounts;
} else if (response?.accounts && Array.isArray(response.accounts)) {
  accounts = response.accounts;
} else if (response?.result && Array.isArray(response.result)) {
  accounts = response.result;
} else if (Array.isArray(response)) {
  accounts = response;
}
```

This is a one-line addition at the top of the existing if-chain.

---

## Files to Change

- `src/lib/api/dehub/dm.ts` — add `response?.accounts?.items` check as the first condition in `searchUsersForDM`
