

## Disable JWT Verification for ssr-seo Edge Function

### What
Add `verify_jwt = false` for the `ssr-seo` function in `supabase/config.toml`.

### Technical Details

**File: `supabase/config.toml`**

Add the following entry:

```toml
[functions.ssr-seo]
verify_jwt = false
```

This is a one-line addition to the config file, consistent with all the other edge functions in the project which already have JWT verification disabled.

