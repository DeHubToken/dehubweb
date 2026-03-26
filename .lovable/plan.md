

# Plan: Add Retry Flag to Token Refresh Interceptor

## Summary
Update the 401 interceptor in `apiCall` to use a `_retry` flag pattern, preventing infinite retry loops. The current implementation lacks per-request retry tracking, which could cause repeated refresh attempts if the retried request also returns 401.

## Current Issue
The interceptor retries on any 401/403 auth error without tracking whether a request has already been retried. If a refreshed token is still rejected, this could loop.

## Changes

### 1. `src/lib/api/dehub/core.ts` — Add retry flag to `apiCall`

- Add an internal `_retry` flag to the options to track whether a request has already been retried after a token refresh.
- Only attempt refresh when `response.data.message` matches `'Access token expired'` (per updated API docs), not on all 401s — other 401s (e.g., invalid permissions) should not trigger refresh.
- On retry, pass `_retry: true` so the same request won't attempt refresh again.
- Skip refresh for requests to `/auth/refresh` endpoint (already done).

Key logic change:
```typescript
// In apiCall options, add internal _retry tracking
const isExpiredToken =
  response.status === 401 &&
  errorMessage.includes('access token expired');

if (isExpiredToken && !options._retry && !endpoint.includes('/auth/refresh')) {
  // attempt refresh, then retry with _retry: true
  return apiCall<T>(endpoint, { ...options, _retry: true });
}
```

### 2. `src/lib/api/dehub/__tests__/core.test.ts` — Add retry flag test

- Add test: "does not retry twice on repeated 401 after refresh" — verifies `_retry` prevents infinite loops.
- Add test: "only refreshes on 'Access token expired' message" — verifies other 401 messages (e.g., "Unauthorized") don't trigger refresh.

