

# Fix: Followers List 403 Error Mishandled as "Session Expired"

## Root Cause

The `apiCall` function in `src/lib/api/dehub.ts` treats **all** 403 responses as authentication failures and throws an `AuthenticationError("Session expired")`. However, the `/api/follow_list` endpoint returns a 403 when the target user has hidden their followers/following list -- this is a **privacy restriction**, not an auth failure.

API response:
```
Status: 403
Body: {"status":false,"error":"This user has hidden their followers/following list"}
```

## Changes

### 1. `src/lib/api/dehub.ts` -- Smarten the 403 handling in `apiCall`

Only treat a 403 as an `AuthenticationError` if the error message actually relates to authentication (unauthorized, invalid token, jwt, etc.). Otherwise, throw a regular `Error` with the API's actual error message.

This means changing the logic around lines 414-420 from:

```
if (response.status === 401 || response.status === 403 || ...)
  throw new AuthenticationError()
```

to:

```
if (response.status === 401 || errorMessage includes auth keywords)
  throw new AuthenticationError()
else
  throw new Error(errorData.error || 'Request failed')
```

A 403 will only be treated as an auth error if the message contains auth-related keywords.

### 2. `src/components/app/profile/FollowersListDrawer.tsx` -- Show a user-friendly privacy message

Update the catch block to detect privacy-related error messages (e.g., "hidden their followers") and show a clear message like "This user has hidden their followers list" instead of the generic "Failed to load list."

## Impact

- Stops the app from incorrectly logging users out or showing "Session expired" when viewing a private follow list
- Shows a clear, accurate message to the user
- All other genuine 401/403 auth errors continue to work as before

