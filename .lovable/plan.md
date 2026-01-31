
# Fix Watch History API Parameter

## Problem Found
The `/api/my_watched_nfts` endpoint is returning `400 Bad Request` with `{"error":"Watcher address is required"}` even though a `watcher` parameter is being sent.

Looking at your API documentation, the correct parameter name is `address` (not `watcher`):
- The docs show: `address (query) - Current viewer address`

The error message "Watcher address is required" is misleading - it describes WHAT is needed, not the parameter name.

## Solution
Change the parameter name from `watcher` back to `address` in the `getWatchHistory` function.

## Technical Changes

**File: `src/lib/api/dehub.ts`**

Change the function signature and params:
```typescript
// Current (broken):
export async function getWatchHistory(
  page: number = 0, 
  limit: number = 20,
  watcher?: string
): Promise<{ result: DeHubNFT[] }> {
  return apiCall<{ result: DeHubNFT[] }>("/api/my_watched_nfts", {
    params: { page, limit, ...(watcher && { watcher }) },
    requiresAuth: true,
  });
}

// Fixed:
export async function getWatchHistory(
  page: number = 0, 
  limit: number = 20,
  address?: string
): Promise<{ result: DeHubNFT[] }> {
  return apiCall<{ result: DeHubNFT[] }>("/api/my_watched_nfts", {
    params: { page, limit, ...(address && { address }) },
    requiresAuth: true,
  });
}
```

No changes needed to `use-bookmarks.ts` since it passes `walletAddress` which will just be used as the `address` argument.
