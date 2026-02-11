

## Redeploy ssr-seo Edge Function

### What
Trigger a redeployment of the `ssr-seo` edge function without any code changes.

### Why
The user has requested a redeployment, possibly to pick up configuration changes (like the recently added `verify_jwt = false` setting) or to refresh the running instance.

### Steps
1. Use the deploy edge functions tool to redeploy `ssr-seo`
2. Verify the deployment succeeded

No code changes are needed -- this is a deployment-only action.
