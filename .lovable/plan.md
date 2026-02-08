

# Fix Silent Upload Failures for 3 Agent Avatars/Banners

## Problem

Three agents — `leothedev`, `omr_`, and `ivyivyivy` — have no profile picture or banner on DeHub despite the upload edge functions reporting success multiple times. The DeHub API returns HTTP 200 but silently doesn't save the images. Our edge functions only check `response.ok` and never inspect the response body or verify the upload actually persisted.

## Current Status (verified via DeHub API)

| Agent | Has Avatar | Has Banner |
|-------|-----------|-----------|
| vrgl, notmaya, 0xkai, xluna, ninarealll, jdot, z4r4eth, riooo, ellaverse, svmp4, mi444 | Yes | Yes |
| leothedev | No | No |
| omr_ | No | No |
| ivyivyivy | No | No |

## Root Cause

The `updateProfileWithAvatar` and `updateProfileBanner` functions check only `response.ok` (HTTP status) but never log or inspect the response body. The DeHub `update_profile` endpoint may return 200 with an error or rejection in the JSON body that we're ignoring. Without logging, we can't know why it's failing.

## Solution

### Step 1: Add response body logging and verification to both edge functions

Modify `updateProfileWithAvatar` in `update-agent-avatars/index.ts` and `updateProfileBanner` in `update-agent-banners/index.ts` to:

1. **Log the full response body** from the `update_profile` call, even on 200 OK
2. **After each upload, verify** by calling `account_info/{username}` to check if `avatarImageUrl` / `coverImageUrl` actually appears
3. **Mark as failed** if verification shows the field is still missing, regardless of HTTP status

This will both fix the silent failure reporting and give us diagnostic data.

### Step 2: Add longer delay and retry for failed agents

For agents that fail verification after the first attempt:
- Wait 2 seconds and retry the upload once
- If the retry also fails verification, report it as a genuine failure with the response body logged

### Changes to `supabase/functions/update-agent-avatars/index.ts`

```
updateProfileWithAvatar():
  - Log the response body text on success (not just on failure)
  - Return the response body for inspection

Main handler:
  - After each upload, call GET account_info/{username}
  - Check if avatarImageUrl field exists in the response
  - If missing, retry once after 2s delay
  - Log verification result
```

### Changes to `supabase/functions/update-agent-banners/index.ts`

```
updateProfileBanner():
  - Log the response body text on success
  - Return the response body for inspection

Main handler:
  - After each upload, call GET account_info/{username}
  - Check if coverImageUrl field exists in the response
  - If missing, retry once after 2s delay
  - Log verification result
```

### Step 3: Deploy and run for failing agents

After deployment, call both functions targeting only the 3 failing agents:
- `{"agents": ["leothedev", "omr_", "ivyivyivy"]}`

The enhanced logging will reveal the actual DeHub response and the verification will confirm whether the upload truly persisted.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/update-agent-avatars/index.ts` | Add response body logging, post-upload verification with retry |
| `supabase/functions/update-agent-banners/index.ts` | Add response body logging, post-upload verification with retry |

## Expected Result

- We'll get diagnostic logs showing exactly why these 3 agents fail
- The retry mechanism may fix the issue if it's a transient/timing problem
- If it's a persistent API-side issue, the logs will show the exact error for further debugging

