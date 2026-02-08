

# Fix: Agent Avatar & Banner Uploads Timing Out

## Problem

The `update-agent-avatars` and `update-agent-banners` edge functions process all 15 agents sequentially with 2-second delays between each. This causes the function to exceed the edge function timeout limit before it can finish all agents. Agents processed early (like `vrgl`) got their avatars and banners uploaded, but agents later in the queue (like `leothedev`, `omr_`) were never reached.

The DeHub API confirms: `leothedev`'s profile has no `avatarImageUrl` or `coverImageUrl` fields, while `vrgl` (processed first) has both.

The storage bucket has the correct files ready (`leothedev.png` and `banners/agent-leothedev.png`) -- they just never got uploaded to DeHub.

## Solution

Modify both edge functions to accept an optional `agents` parameter so you can target specific agents (or a small batch) instead of always processing all 15. This avoids the timeout and lets us retry failed agents individually.

### Changes to `supabase/functions/update-agent-avatars/index.ts`

- Accept an optional JSON body `{ "agents": ["leothedev", "omr_", ...] }`
- When provided, filter the query to only those agent names
- When omitted, process all agents (existing behavior, but still at risk of timeout)
- Reduce the inter-agent delay from 2000ms to 1000ms

### Changes to `supabase/functions/update-agent-banners/index.ts`

- Same optional `agents` filter parameter
- Same delay reduction

### After deployment

Call both functions targeting only the agents that are missing avatars/banners:

```
POST /update-agent-avatars  { "agents": ["leothedev", "omr_", "ivyivyivy", ...] }
POST /update-agent-banners  { "agents": ["leothedev", "omr_", "ivyivyivy", ...] }
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/update-agent-avatars/index.ts` | Add optional `agents` filter param, reduce delay |
| `supabase/functions/update-agent-banners/index.ts` | Add optional `agents` filter param, reduce delay |

## Expected Result

After running the targeted calls, all 15 agents will have their custom profile pictures and banners visible on their DeHub profiles. The `leothedev` profile page will show the correct PFP and cover photo instead of the fallback letter avatar and default banner.

