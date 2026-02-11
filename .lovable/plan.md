
# Fix outoforrder's Avatar and Check for Missing Wallets

## Problem 1: Broken Avatar
The avatar URL for outoforrder in `EXTRA_WALLETS` includes `statics/` in the path:
```
https://dehubcdn.ams3.cdn.digitaloceanspaces.com/statics/avatars/0xf96e...jpeg
```
The `buildAvatarUrl` function sees it starts with `https://dehubcdn` and returns it unchanged -- but the `statics/` prefix makes it a broken URL on the CDN. Maldoteth's entry uses the correct clean path (without `statics/`).

## Problem 2: Missing Wallets
Based on the cached data, no other previously-present wallets appear to have fallen out. The current cache has 20+ entries and the rankings look consistent. The DeHub `account_info` API returns "No result" for outoforrder's wallet, which suggests an API-side issue with that specific account -- but the leaderboard cache already has their data injected correctly via `EXTRA_WALLETS`.

## Fix

**File**: `supabase/functions/refresh-leaderboard-cache/index.ts` (line 175)

Change the avatar URL from:
```
https://dehubcdn.ams3.cdn.digitaloceanspaces.com/statics/avatars/0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5.jpeg
```
to:
```
https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5.jpeg
```

Then redeploy the edge function and trigger a cache refresh so the corrected URL propagates.
