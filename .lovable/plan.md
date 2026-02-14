
## Fix: batch-avatars Edge Function Failing for All Addresses

### Root Cause
The `batch-avatars` edge function checks `if (!data.status || !data.result)` on line 50, but the DeHub API `/api/account_info/{address}` does NOT return a `status` field. The response is just `{ result: { ... } }` with no `status` boolean.

Since `data.status` is `undefined` (falsy), the check fails for **every single address**, causing all avatars to return `null` with error "No result". This means the enrichment service has been completely broken -- no fresh avatars have been loading at all.

### Fix
**File:** `supabase/functions/batch-avatars/index.ts`

Change the validation on line 50 from:
```typescript
if (!data.status || !data.result) {
```
to:
```typescript
if (!data.result) {
```

This single-line fix will make the edge function correctly parse the API response, returning real avatar URLs, usernames, and display names. Combined with the cache-busting already added to `buildAvatarUrl`, okanbey (and all other users) will show their current profile pictures in notifications.

### Verification
After deploying, the `batch-avatars` response will change from:
```json
{"avatarUrl": null, "error": "No result"}
```
to actual data like:
```json
{"avatarUrl": "avatars/0xabc.jpg", "username": "okanbey", "displayName": "Okanbey"}
```
