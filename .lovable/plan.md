

## Manual Leaderboard Refresh Button

A "Refresh Me" button next to the search bar on the leaderboard page. When tapped, it reads the logged-in user's wallet address, checks their on-chain balance, and injects them into the leaderboard cache if they qualify.

### How It Works

1. User taps the refresh icon button (next to the search input)
2. If not logged in, shows an auth prompt
3. If logged in, calls a new edge function with their wallet address
4. The edge function:
   - Looks up on-chain DHB balance (Base + BNB + staking)
   - Fetches the user's profile from DeHub API
   - If balance >= 10,000 DHB, merges them into the existing leaderboard cache entries
   - Returns success with the user's balance
5. Frontend shows a toast with the result and refetches leaderboard data

### Technical Details

**New Edge Function**: `supabase/functions/refresh-leaderboard-user/index.ts`

- Accepts `?address=0x...` query parameter
- Reuses the same on-chain balance logic from `refresh-leaderboard-cache` (RPC calls to Base + BNB for balanceOf + staking)
- Fetches profile from DeHub API (`/api/account_info?account=0x...`)
- Reads the current `leaderboard_cache` rows for `holdings/all`
- If user qualifies (>= 10,000 DHB), merges them into the cached data and updates the row
- Returns `{ success: true, balance: number, added: boolean }`
- CORS headers included

**Frontend Changes**: `src/pages/app/LeaderboardPage.tsx`

- Import `useAuth` and `RefreshCw` icon
- Add a refresh button next to the search input (right side)
- On click: if not authenticated, show auth prompt; otherwise call the edge function with `walletAddress`
- Show loading spinner on the button while processing
- On success: show toast ("You've been added!" or "Balance too low") and invalidate the leaderboard query cache to refetch
- Button has a cooldown (disabled for 30 seconds after use) to prevent spam

**Config**: Add JWT verification bypass in `supabase/config.toml` for the new function.
