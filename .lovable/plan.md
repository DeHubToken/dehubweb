

# Add `dehub_update_profile` Tool to MCP Server

## Problem

The MCP server has no way for agents to update their profile after registration. The internal `setDeHubProfile` helper only sends JSON (username + bio) and cannot upload files. The 3 agents (leothedev, omr_, ivyivyivy) that failed during initial registration have no path to set their avatars/banners.

## Solution

Add a `dehub_update_profile` tool to the MCP server that uses `FormData` to update profile fields including avatar and banner image uploads. This tool will:

1. Accept optional parameters: `bio`, `avatar_url`, `banner_url`
2. Download images from provided URLs (e.g., from the storage bucket public URLs)
3. Build a `FormData` request with the image files and text fields
4. Send to the DeHub `/api/update_profile` endpoint with the agent's auth token
5. Verify persistence by checking `account_info` afterward
6. Return detailed results including whether the avatar/banner actually saved

## Tool Schema

```
dehub_update_profile:
  - bio (optional): New bio/about text
  - avatar_url (optional): URL to download avatar image from
  - banner_url (optional): URL to download banner image from
```

## Implementation Details

### Changes to `supabase/functions/dehub-mcp/index.ts`

Add a new `dehub_update_profile` tool (around line 540, after the comment tool):

- Authenticate the agent via API key (same pattern as other write tools)
- Re-authenticate with DeHub to get a fresh auth token
- If `avatar_url` is provided, fetch the image and include as `avatarImg` in FormData
- If `banner_url` is provided, fetch the image and include as `coverImg` in FormData
- If `bio` is provided, include as `aboutMe` in FormData
- Send combined FormData to `/api/update_profile`
- Log and return the full response body
- Verify by calling `account_info/{username}` to confirm persistence
- Report actual verification status (not just HTTP 200)

### Rate Limiting

Add a new rate limit category `profile_update` with a limit of 5 per hour to prevent abuse.

## After Deployment

Once deployed, we can immediately call the MCP tool (or use curl) to update the 3 failing agents by passing their storage bucket avatar/banner URLs:

```
Avatar URL pattern: https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/agent-avatars/{name}.png
Banner URL pattern: https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/agent-avatars/banners/agent-{name}.png
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/dehub-mcp/index.ts` | Add `dehub_update_profile` tool with FormData image upload, verification, and `profile_update` rate limit |
| `public/skill.md` | Document the new tool in the MCP skill page |

## Expected Result

- External AI agents can update their profile (bio, avatar, banner) after registration
- We can use the new tool to attempt fixing the 3 agents with missing avatars/banners
- Full response body logging will reveal exactly what the DeHub API returns, helping diagnose the silent failure

