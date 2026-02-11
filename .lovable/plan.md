

## Time-Based Holdings Leaderboard (Balance Increase Tracking)

### Current State

Right now, the holdings leaderboard only shows **current total balances**. The same data is stored for all time periods (day/week/month/year/all) because there are no historical snapshots to compare against.

### What's Needed

To show "who bought/increased the most" over a given period, we need to:

1. **Record periodic balance snapshots** so we can calculate the difference
2. **Compute deltas** (current balance minus snapshot balance) for each time window
3. **Sort by delta** for day/week/month/year views, while "All Time" stays sorted by total balance

### Difficulty: Medium

The logic is straightforward but requires a new database table and changes to the cron-refreshed edge function. No external API changes needed since we already query on-chain balances.

### Plan

#### 1. New Database Table: `leaderboard_snapshots`

Stores a daily snapshot of each user's on-chain balance:

```text
leaderboard_snapshots
  - id (uuid, PK)
  - account (text) -- wallet address
  - balance (numeric) -- total DHB at snapshot time
  - snapshot_date (date) -- the day this was recorded
  - created_at (timestamptz)
  - UNIQUE(account, snapshot_date)
```

RLS: read-only for anon (public leaderboard data), writes only via service role (edge function).

#### 2. Update `refresh-leaderboard-cache` Edge Function

After computing on-chain balances, the function will:

- **Upsert today's snapshot** for every holder into `leaderboard_snapshots`
- **Compute deltas** for each period by comparing current balance to the snapshot from N days ago:
  - Day: snapshot from 1 day ago
  - Week: snapshot from 7 days ago
  - Month: snapshot from 30 days ago
  - Year: snapshot from 365 days ago
- **Store period-specific sorted results** in `leaderboard_cache` where entries are sorted by balance increase (delta) rather than total balance
- **All Time** remains sorted by total balance (no change)

#### 3. Update Frontend (`LeaderboardPage.tsx`)

- When viewing day/week/month/year for Holdings, display the **increase amount** instead of total balance (e.g., "+2.5M DHB")
- All Time continues to show total balance as it does now
- The `balanceOverrides` logic stays for All Time only

#### 4. Sidebar Leaderboard

- Sidebar always shows All Time holdings (no change needed)

### Technical Considerations

- **Bootstrap period**: For the first few days, day/week/month/year views will show limited or no data since there are no historical snapshots yet. We can show a note like "Tracking started recently" or fall back to total balance.
- **Storage cleanup**: Add a retention policy to delete snapshots older than 400 days (only need ~365 for yearly).
- **Cron frequency**: The existing 5-minute cron only needs to snapshot once per day. The function can check if today's snapshot already exists before writing.

