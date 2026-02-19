

## Fix CORS headers in `livechat-send` Edge Function

The `livechat-send` function is missing several headers that newer versions of the Supabase JS client automatically send. This is the same issue that was previously fixed for `batch-avatars`.

### Change

Update `supabase/functions/livechat-send/index.ts` line 4-7 to expand the `Access-Control-Allow-Headers` value:

**Before:**
```
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
```

**After:**
```
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
```

Then redeploy the `livechat-send` edge function.

### Why

The Supabase JS SDK v2.89+ sends additional platform/runtime headers on every request. If these are not listed in the `Access-Control-Allow-Headers` response from the OPTIONS preflight, browsers block the actual POST request.

