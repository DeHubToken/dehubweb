
# Fix Agent Avatar Uploads

## Problem
All 15 AI agents are registered on DeHub but have no profile pictures. The `register-template-agents` edge function sends profile updates as JSON, but the DeHub API requires `FormData` with an `avatarImg` file field for avatar uploads. Additionally, the avatar PNGs in `src/assets/avatars/` are inaccessible to edge functions at runtime.

## Solution Overview

### Step 1: Create a Storage Bucket for Agent Avatars

Create a public `agent-avatars` storage bucket via SQL migration so the edge function can fetch avatar images at runtime.

- Bucket: `agent-avatars` (public, read-only for anonymous users)
- RLS policy: Allow public read access, service-role write access

### Step 2: User Uploads Avatar PNGs to the Bucket

After the bucket is created, the user will need to upload the 15 avatar PNGs to the `agent-avatars` bucket. Each file should be named `{agent_name}.png` (e.g., `0xkai.png`, `ellaverse.png`, etc.). This can be done through the backend Cloud View.

The 15 files to upload:
- `0xkai.png`, `ellaverse.png`, `ivyivyivy.png`, `jdot.png`, `leothedev.png`
- `marco_v.png`, `mi444.png`, `ninarealll.png`, `notmaya.png`, `omr_.png`
- `riooo.png`, `svmp4.png`, `vrgl.png`, `xluna.png`, `z4r4eth.png`

### Step 3: Create New `update-agent-avatars` Edge Function

A dedicated edge function that:

1. Fetches all registered agents from `ai_agents` (those with `wallet_private_key IS NOT NULL`)
2. For each agent:
   - Downloads the avatar PNG from the `agent-avatars` storage bucket (`{agent_name}.png`)
   - Re-authenticates with the DeHub API using the stored `wallet_private_key`
   - Constructs a `FormData` body with `avatarImg` (the image file) plus `username` and `aboutMe`
   - Sends a POST to `https://api.dehub.io/api/update_profile` with the FormData
   - Logs success/failure per agent
3. Returns a summary of results

### Step 4: Update `register-template-agents` for Future Registrations

Modify the `setDeHubProfile` function to also upload an avatar via FormData when registering new agents, so future registrations include profile pictures automatically.

The key change: instead of sending JSON, send `FormData` with the `avatarImg` file attached.

---

## Technical Details

### Storage Bucket Migration (SQL)
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-avatars', 'agent-avatars', true);

CREATE POLICY "Allow public read on agent-avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-avatars');

CREATE POLICY "Allow service role insert on agent-avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agent-avatars');
```

### Edge Function: `update-agent-avatars/index.ts`

Key logic:
```text
1. Fetch all agents with wallet_private_key from ai_agents table
2. For each agent:
   a. Download avatar from storage: GET agent-avatars/{name}.png
   b. Re-authenticate: sign message with stored private key -> POST /api/web/auth
   c. Build FormData with avatarImg blob + username + aboutMe
   d. POST /api/update_profile with Authorization: Bearer {token}
   e. Add 2s delay between agents to avoid rate limiting
3. Return JSON summary of successes and failures
```

### FormData Profile Update (the fix)
```text
-- Current (broken): sends JSON, no avatar
Content-Type: application/json
{ "username": "...", "aboutMe": "..." }

-- Fixed: sends FormData with avatar file
Content-Type: multipart/form-data
FormData:
  - avatarImg: [PNG blob, filename: "{name}.png"]
  - username: "{name}"
  - aboutMe: "{description}"
```

### Config Changes
Add to `supabase/config.toml`:
```toml
[functions.update-agent-avatars]
verify_jwt = false
```

### Files Changed
1. **New SQL migration** -- Create `agent-avatars` storage bucket + RLS policies
2. **New file**: `supabase/functions/update-agent-avatars/index.ts` -- Dedicated avatar upload function
3. **Modified**: `supabase/functions/register-template-agents/index.ts` -- Update `setDeHubProfile` to use FormData with avatar for future registrations
4. **Modified**: `supabase/config.toml` -- Add `update-agent-avatars` function config

### Execution Flow
After implementation, the process will be:
1. Storage bucket gets created automatically via migration
2. User uploads 15 PNGs to the `agent-avatars` bucket via the Cloud View
3. Call `POST /functions/v1/update-agent-avatars` to push all avatars to DeHub
4. Future agent registrations will automatically include avatars
