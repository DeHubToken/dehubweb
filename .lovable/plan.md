
# Fix Missing Avatars in Story Playback

## Problem

After xluna, all remaining agents (marco_v, ninarealll, jdot, etc.) show a generic letter fallback instead of their actual profile picture in the story viewer. This is caused by two bugs working together.

## Root Causes

### 1. Wrong wallet address for avatar lookups

The `fetchTemplateStories` function queries `owner_wallet_address` from the `ai_agents` table. This is the **human creator's wallet**, not the agent's own registered DeHub wallet (which is derived from `wallet_private_key`). So the avatar enrichment step looks up the wrong account on DeHub and gets back either someone else's avatar or nothing.

### 2. Local asset paths get corrupted

When enrichment fails, the fallback avatar is a Vite-bundled local file path (e.g., `/assets/avatars/vrgl-abc123.png`). The story viewer's `resolvedAvatar` logic only handles URLs starting with `http` -- local paths fall through to `buildAvatarUrl()` which constructs a broken CDN URL that doesn't exist. The same issue affects `StoriesBar.tsx` line 212 where it calls `buildAvatarUrl()` on the story avatars.

## Solution

### Step 1: Fix avatar URL resolution in story viewer (`StoryViewerModal.tsx`)

Update the `resolvedAvatar` logic to recognize local asset paths (those starting with `/`) and return them as-is, before falling through to CDN URL construction.

```
Before:  http check -> buildAvatarUrl (breaks local paths)
After:   http check -> local path check -> buildAvatarUrl
```

### Step 2: Fix avatar enrichment to use agent usernames (`use-stories.ts`)

Replace `fetchFreshAvatar(walletAddress)` with a username-based lookup using `getAccountByUsername(username)` for template stories. This correctly resolves the agent's own DeHub profile avatar instead of the owner's. The DeHub API already supports lookup by username (via `getAccountByUsername`).

Changes:
- Update the enrichment query to pass usernames alongside wallet addresses
- For template stories with known usernames, use `getAccountByUsername(username)` instead of `getAccountInfo(walletAddress)`
- Keep local `TEMPLATE_AVATARS` as the final fallback if the API call fails

### Step 3: Fix StoriesBar avatar handling (`StoriesBar.tsx`)

Line 212 calls `buildAvatarUrl(story.wallet_address, story.avatar)` which also mangles local asset paths. Add the same local-path guard: if `story.avatar` starts with `/`, use it directly.

## Files Changed

| File | Change |
|------|--------|
| `src/components/app/stories/StoryViewerModal.tsx` | Guard `resolvedAvatar` against local asset paths |
| `src/hooks/use-stories.ts` | Use `getAccountByUsername` for template story avatar enrichment |
| `src/components/app/cards/StoriesBar.tsx` | Guard avatar resolution against local asset paths |

## Expected Result

All 15 agent stories will display their correct profile pictures in both the stories bar thumbnails and the story playback viewer, using either the live DeHub avatar (if available) or the bundled local asset as a reliable fallback.
