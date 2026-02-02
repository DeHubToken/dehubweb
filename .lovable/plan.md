
# Fix: Staking Badges Showing Tortoise for Everyone

## Problem Analysis

The staking tier badge always shows "Tortoise" (the lowest tier) because:

1. **Leaderboard**: The DeHub `/api/leaderboard` endpoint does NOT include staking data in its response. The cached data only contains: `account`, `total`, `username`, `userDisplayName`, `avatarUrl`, `sentTips`, `receivedTips`. Since `staked` is undefined, the badge utility defaults to Tortoise.

2. **Feeds**: The feed API DOES return `minterStaked`, and this is being correctly mapped. However, many users on the platform have `0` DHB staked, which legitimately puts them in the Tortoise tier.

## Solution: Enrich Leaderboard Cache with Staking Data

Update the `refresh-leaderboard-cache` edge function to fetch staking data for each user during the cache refresh process.

### Implementation Details

#### 1. Add Staking Data Fetcher
Create a helper function to fetch staking data from the account info endpoint:

```typescript
async function fetchUserStaking(account: string): Promise<number> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${account}`);
    if (!response.ok) return 0;
    
    const data = await response.json();
    const user = data.result || data;
    
    // Check balanceData array first, then direct staked field
    if (user.balanceData?.length > 0) {
      return user.balanceData.reduce((sum, b) => sum + (b.staked || 0), 0);
    }
    return user.staked || 0;
  } catch {
    return 0;
  }
}
```

#### 2. Batch Process for Efficiency
Since leaderboards can have hundreds of entries, process users in parallel batches:

```typescript
async function enrichWithStaking(entries: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  const BATCH_SIZE = 10; // Process 10 users at a time
  const enriched: LeaderboardEntry[] = [];
  
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        // Skip wallet-only entries (no username)
        if (!entry.username) return entry;
        const staked = await fetchUserStaking(entry.account);
        return { ...entry, staked };
      })
    );
    
    // Collect successful results
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        enriched.push(result.value);
      }
    });
  }
  
  return enriched;
}
```

#### 3. Integrate into Cache Refresh Flow
Modify the main caching logic to enrich data before storing:

```typescript
// After fetching leaderboard data
const rawData = await fetchLeaderboard(sort, period);
const entries = rawData?.result?.byWalletBalance || [];

// Enrich with staking data
const enrichedEntries = await enrichWithStaking(entries);

// Store enriched data
const enrichedData = {
  ...rawData,
  result: { byWalletBalance: enrichedEntries }
};

await supabase.from("leaderboard_cache").upsert({
  sort_mode: sort,
  period: period,
  data: enrichedData,
  updated_at: new Date().toISOString(),
});
```

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/refresh-leaderboard-cache/index.ts` | Add staking enrichment logic with batch processing |

### Performance Considerations

- **Batch size of 10**: Balances speed with avoiding rate limits
- **Background process**: Runs during 6-hour cache refresh, not on page load
- **Graceful failures**: If staking fetch fails for a user, they keep `0` (Tortoise) - acceptable fallback
- **Only enrich users with usernames**: Skip wallet-only entries to save API calls

### Testing Plan

1. Deploy the updated edge function
2. Manually trigger a cache refresh
3. Query the database to verify `staked` values are now present in cached entries
4. Check the leaderboard page to confirm badges reflect actual staking tiers
