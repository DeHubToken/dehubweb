
# Fix: Batch Avatars Edge Function Using Wrong API Endpoint

## Problem
The `@viral` account (and all other accounts) are not loading profile pictures on the feed anymore. The batch-avatars system returns `HTTP 404` for every address.

## Root Cause
The `batch-avatars` edge function was created with an **incorrect API endpoint**:
- **Currently using:** `https://api.dehub.io/api/account/{address}` → Returns 404
- **Correct endpoint:** `https://api.dehub.io/api/account_info/{address}` → Returns user data

This means every batch avatar request fails, returns `avatarUrl: null`, and the frontend falls back to showing nothing (or the fallback initial letter).

## Evidence from Network Logs
```json
// Response from batch-avatars
{
  "avatars": {
    "0x84b519...": { "avatarUrl": null, "error": "HTTP 404" },
    "0xd627ad...": { "avatarUrl": null, "error": "HTTP 404" },
    // ... ALL addresses returning 404
  }
}
```

---

## Solution
Fix the API endpoint in the edge function from `/api/account/` to `/api/account_info/`.

---

## Changes Required

### 1. Update `supabase/functions/batch-avatars/index.ts`

Change line 37 from:
```typescript
const response = await fetch(`${DEHUB_API_BASE}/api/account/${address}`, {
```

To:
```typescript
const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(address)}`, {
```

This matches the working endpoint used in the main `getAccountInfo` function in `src/lib/api/dehub.ts`.

---

## Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| Endpoint | `/api/account/{address}` | `/api/account_info/{address}` |
| Response | HTTP 404 for all | Full user profile |
| Avatar loading | Broken | Working |

---

## Files Modified
- `supabase/functions/batch-avatars/index.ts` - Fix API endpoint
