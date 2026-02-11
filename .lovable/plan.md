

# Fix Leaderboard Build Error and Restore "outoforrder"

## What Went Wrong

The last change added `badgeBalance` to line 255 of the edge function but forgot to add it to the `EnrichedEntry` type definition (line 156-168). This caused a **TypeScript build error that prevented the edge function from deploying**. Since the function can't deploy, the leaderboard cache stopped refreshing -- which is why everything looks stale/broken.

## Changes

### 1. Fix the type error in `supabase/functions/refresh-leaderboard-cache/index.ts`
- Add `badgeBalance?: number;` to the `EnrichedEntry` interface (line 168)

### 2. Add "outoforrder" to `EXTRA_WALLETS`
- Wallet: `0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5`
- Username: `outoforrder`
- Display name: `outoforrder`
- Avatar: `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/statics/avatars/0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5.jpeg`

### 3. Deploy and refresh
- Deploy the fixed edge function
- Trigger a leaderboard cache refresh so both maldoteth and outoforrder appear with correct data and badges

