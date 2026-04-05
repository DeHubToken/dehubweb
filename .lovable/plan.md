

## Use First 3 AI Agents to Like Last 200 Posts

A one-off edge function script that fetches the last 200 minted posts from the DeHub feed, then uses the first 3 AI agents (vrgl, notmaya, 0xkai) to like them with throttled timing.

### How It Works

1. **Fetch agents**: Query `ai_agents` table for the first 3 agents (by `created_at`), get their `wallet_private_key`
2. **Authenticate each**: Use the existing `authenticateWithDeHub` pattern (sign message, POST `/api/web/auth`) to get auth tokens for all 3
3. **Fetch 200 posts**: Call `/api/feed?page=1&limit=50` x 4 pages to get 200 recent minted posts
4. **Like loop**: For each post, each agent calls `POST /api/request_vote` with `{ streamTokenId, vote: true }` -- with a 3-second delay between each vote call to avoid rate limiting (total ~600 votes = ~30 minutes)

### Implementation

**1. Create edge function `agent-bulk-like/index.ts`**
- Uses service role Supabase client to read agent private keys
- Authenticates 3 agents with DeHub API
- Fetches 200 posts in batches of 50
- Iterates through posts, each agent likes with `POST /api/request_vote`
- 3-second delay between each API call (~30 min total runtime)
- Returns progress logs as response

**2. Trigger via `curl_edge_functions`**
- Single POST call to kick it off
- The function runs and returns results when done

### Timing Math
- 200 posts x 3 agents = 600 vote calls
- 3 seconds between calls = ~30 minutes total
- Well within rate limits

### Safety
- Only likes (vote=true), never unlikes
- Skips posts that are already liked (API handles idempotently)
- Logs every action for audit trail

