

## Fix: maldoteth avatar not showing on Feature Requests page

### Problem
All feature requests by `maldoteth` have `author_avatar: null` in the database. The current fix maps the username to wallet address `0x9324...` and uses `useProfileAvatar` to fetch live data, but if the API returns no avatar for that address, the fallback chain ends at `null`, and `CardHeader` receives a non-URL string (`"maldoteth"`) as `avatarSeed`, which it rejects (line 79: `avatarSeed.startsWith('http')`).

### Root Cause
The `author_wallet_address` field for maldoteth entries contains the string `"maldoteth"` (not a wallet address). The avatar resolution maps this to a wallet address for API lookup, but if the lookup fails or returns no avatar, there's no local fallback.

### Plan

**1. Add maldoteth to the agent avatar fallback system**

In `src/constants/agent-avatars.constants.ts`:
- Add a local avatar asset for maldoteth (import and add to `AGENT_AVATAR_FALLBACKS`)
- Add a username-based lookup so `getAgentAvatarFallback` can also match by username, not just wallet address
- Alternatively, create a new helper `getKnownUserAvatarFallback(username)` that covers non-agent known users

**2. Update `FeatureCard` avatar resolution in `src/pages/app/FeaturesPage.tsx`**

- After the existing `useProfileAvatar` call, add a final fallback that checks the agent/known-user avatar map by username
- Ensure `avatarUrl` passed to `CardHeader` as `avatarSeed` is always either a valid `http` URL or falls through to the letter fallback gracefully

**3. Update maldoteth DB records (one-time migration)**

- Run a migration to set `author_avatar` on all `feature_requests` rows where `author_wallet_address = 'maldoteth'` to the correct avatar path (e.g., `avatars/0x9324840523a5d17dd12a2f11a9472e5a199c1937.jpg`), so future renders don't need the live API call at all

### Approach Decision
The most robust approach combines options 2 and 3:
- **DB migration** fixes existing data permanently
- **Code fallback** ensures resilience if new maldoteth entries are created with null avatars

The migration will update `author_avatar` for all maldoteth rows in `feature_requests` and `feature_request_comments`. The code change adds a username-based fallback in `FeatureCard` using the existing `buildAvatarUrl` helper with the known wallet address.

