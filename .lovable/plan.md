

## Audit: Unused Edge Functions & Dead Code

### Analysis

I searched every edge function directory against all frontend code references. Here's the full picture:

### Edge Functions That Can Be Deleted (7 functions)

| Function | Reason |
|----------|--------|
| `detect-language` | **Zero invocations** in any frontend code. Was built but never wired up. Uses Lovable AI credits on every call. |
| `backfill-leaderboard-snapshots` | **Zero references** in frontend. One-time migration utility for seeding historical data. No longer needed. |
| `backfill-tip-snapshots` | **Zero references** in frontend. Same — one-time backfill script, served its purpose. |
| `register-template-agents` | **Zero references**. One-time setup script for seeding agent templates. |
| `update-agent-avatars` | **Zero references**. One-time batch update script. |
| `update-agent-banners` | **Zero references**. One-time batch update script. |
| `batch-follow` | **Zero references**. Never wired into any UI. |

### Edge Functions To Investigate (3 functions)

| Function | Status |
|----------|--------|
| `validate-tv-channels` | **Zero frontend references**. Was likely a one-time or admin-only tool. Safe to delete unless you run it manually. |
| `proxy-stream` | **Zero frontend references**. May be called by external infrastructure (e.g. video player HLS proxy). Needs confirmation. |
| `ssr-seo` | **Zero frontend references** but designed to be hit by crawlers/bots directly via URL, not invoked from JS. **Keep** — it serves OG meta tags for link previews on social media. |

### Edge Functions That Are Used (keep all)

`agora-token`, `client-logs`, `dehub-mcp`, `dm-send`, `dm-upload-media`, `end-stream-session`, `enhance-text`, `feature-request-vote`, `fetch-link-preview`, `general-ai-chat`, `generate-image`, `generate-video`, `get-dhb-price`, `get-pimlico-config`, `get-rpc-endpoints`, `get-stream-ingest`, `get-web3auth-config`, `livechat-send`, `mark-stream-live`, `refresh-leaderboard-cache`, `refresh-leaderboard-user`, `report-broken-channel`, `stories-api`, `translate-image`, `translate-text`

### Dead Frontend Code

`detect-language` has no callers, but `translate-text` and `translate-image` are actively used. No other obvious dead frontend modules were found — the `unused-endpoints.md` tracker shows everything else is wired up.

### Implementation Plan

1. **Delete 7 edge function directories**: `detect-language`, `backfill-leaderboard-snapshots`, `backfill-tip-snapshots`, `register-template-agents`, `update-agent-avatars`, `update-agent-banners`, `batch-follow`
2. **Remove their entries** from `supabase/config.toml`
3. **Delete the deployed functions** from the backend
4. **Optionally delete** `validate-tv-channels` and `proxy-stream` if you confirm they're not used externally

### Questions Before Proceeding

- **`proxy-stream`**: Is this called by your video player or any external service to proxy HLS streams? If not, it can go.
- **`validate-tv-channels`**: Do you ever run this manually to check TV channel health? If not, it can go.

