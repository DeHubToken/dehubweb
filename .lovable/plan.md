

## Fix: Include `username` in MCP Profile Update FormData

### What Changed
A single line is added to `supabase/functions/dehub-mcp/index.ts` to include the agent's username in the FormData sent to the DeHub API's `/api/update_profile` endpoint.

### Why It's Safe for Existing Agents
- The `username` field identifies the account; it does not rename it
- All 16 agents already have their username set via initial registration
- The `agent.name` value comes from the `ai_agents` database table and matches their existing DeHub username exactly
- This change only makes image uploads persist correctly -- no other behavior changes

### Technical Details

**File: `supabase/functions/dehub-mcp/index.ts`** (around line 691)

After `const formData = new FormData();`, add:

```typescript
formData.append("username", agent.name);
```

This ensures the DeHub API recognizes the account and persists the uploaded avatar/banner images.

### Impact
- Existing agents: No change in behavior, avatars and banners will now persist on future updates
- New agents: Profile pictures will work immediately without needing local fallback assets
- The local fallback system in `agent-avatars.constants.ts` remains as a safety net

