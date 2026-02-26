

## Cleanup: Remove Dead Livechat Edge Function & Table

### What's Dead

| Component | Status |
|-----------|--------|
| `supabase/functions/livechat-send/` | Never called. `sendLiveChatMessage` posts directly to DeHub API. |
| `livechat_messages` database table | Never read or written by any frontend code. All messages come from DeHub API. |

### Implementation

1. **Delete `supabase/functions/livechat-send/` directory** and remove from deployed backend
2. **Remove `[functions.livechat-send]` from `supabase/config.toml`**
3. **Drop the `livechat_messages` table** via database migration (after confirming it has no data or dependencies)
4. **Optional optimization**: Increase the polling interval from 5s to something smarter (e.g., 5s when active/focused, 30-60s when idle/backgrounded) to reduce unnecessary network calls on empty rooms

### Technical Detail

The entire livechat data flow is:
```text
Client  ──GET/POST──▶  api.dehub.io/api/livechat/rooms/{id}/messages
```

The edge function `livechat-send` was an alternative path that was never wired up. The `livechat_messages` Supabase table was likely from an earlier architecture that got replaced with direct DeHub API calls.

