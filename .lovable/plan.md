

# Refresh Token Integration Plan

## Summary

Integrate the new backend refresh token system into the existing auth flow. Access tokens now expire in 15 minutes (down from 24 hours). A new `refreshToken` is returned on login and can be exchanged at `POST /auth/refresh` for a new token pair without requiring a wallet signature.

## Current State

- `authenticateWallet()` in `auth.ts` calls `POST /api/web/auth`, stores `data.token` via `setAuthToken()`
- `core.ts` tracks token expiry with a hardcoded `TOKEN_EXPIRY_MS = 24h` and a localStorage timestamp
- `apiCall()` in `core.ts` throws `AuthenticationError` on 401s
- `useReauthHandler` catches `AuthenticationError`, calls `refreshSession()` which re-signs with the wallet (requires user interaction)
- `refreshSession()` in `AuthContext.tsx` does a full wallet re-sign (popup) — this will now happen every 15 min if we don't use refresh tokens

## What Changes

### 1. Token Storage Layer (`src/lib/api/dehub/core.ts`)

- Add `setRefreshToken(token)` / `getRefreshToken()` / `clearRefreshToken()` — stores in `localStorage` as `dehub_refresh_token`
- Change `TOKEN_EXPIRY_MS` from 24h to use the `expiresIn` value from the server (store as `dehub_token_expires_at` timestamp)
- Add new `setTokenExpiresAt(expiresAt)` function
- Update `isTokenExpired()` to check `dehub_token_expires_at` instead of computing from a fixed 24h window
- Update `clearAuthSession()` to also clear `dehub_refresh_token` and `dehub_token_expires_at`

### 2. Refresh Token API Function (`src/lib/api/dehub/auth.ts`)

- Add `refreshAccessToken()`: calls `POST /auth/refresh` with the stored refresh token, no auth header needed
- Returns `{ accessToken, refreshToken, expiresIn }` — note the field is `accessToken` (not `token`)
- Add `logoutFromServer()`: calls `POST /auth/logout` with the refresh token + Bearer header (best-effort)
- Add `logoutAllSessions()`: calls `POST /auth/logout-all` with Bearer header

### 3. Automatic 401 Retry in `apiCall()` (`src/lib/api/dehub/core.ts`)

- When a 401 is received, before throwing `AuthenticationError`, attempt a single token refresh using `refreshAccessToken()`
- Use a module-level `isRefreshing` flag + `failedQueue` pattern (from the docs) to prevent concurrent refresh calls
- If refresh succeeds: update stored tokens, retry the original request with the new token
- If refresh fails (401 from refresh endpoint = token reuse detected): clear all tokens, throw `AuthenticationError`
- Skip retry if the failing request was itself the `/auth/refresh` endpoint

### 4. Update Login Response Handling (`src/lib/api/dehub/auth.ts`)

- In `authenticateWallet()`, after receiving the response, also store `data.refreshToken` via `setRefreshToken()` and compute `expiresAt` from `data.expiresIn`
- Update `AuthResponse` type in `types.ts` to include `refreshToken?: string` and `expiresIn?: number`

### 5. Proactive Token Refresh (`src/contexts/AuthContext.tsx`)

- Add a `useEffect` timer that checks token expiry every 60 seconds
- If the token will expire within 2 minutes, proactively call `refreshAccessToken()` in the background
- This prevents users from ever hitting a 401 during normal usage

### 6. Update `refreshSession()` (`src/contexts/AuthContext.tsx`)

- Before falling back to wallet re-sign, first try `refreshAccessToken()`
- If the refresh token is available and valid, use it — no wallet interaction needed
- Only fall back to wallet re-sign if refresh token is also expired/missing

### 7. Update `disconnect()` (`src/contexts/AuthContext.tsx`)

- Call `logoutFromServer()` (best-effort, fire-and-forget) to revoke the refresh token server-side before clearing local state

### 8. Update `isAuthenticated` Check

- The existing check `!!getAuthToken() && !isTokenExpired()` will work, but since tokens expire in 15 min, also check for a valid refresh token to avoid showing "logged out" UI while a refresh is possible
- Change to: token is valid OR refresh token exists

## Files Modified

| File | Change |
|---|---|
| `src/lib/api/dehub/core.ts` | Add refresh token storage, update expiry logic, add auto-retry on 401 |
| `src/lib/api/dehub/auth.ts` | Store refresh token on login, add `refreshAccessToken()`, `logoutFromServer()` |
| `src/lib/api/dehub/types.ts` | Add `refreshToken` and `expiresIn` to `AuthResponse` |
| `src/contexts/AuthContext.tsx` | Proactive refresh timer, update `refreshSession()`, update `disconnect()`, update `isAuthenticated` |
| `src/hooks/use-reauth-handler.ts` | No changes needed — it already calls `refreshSession()` which will now use refresh tokens |

## Security Notes

- Refresh token stored in `localStorage` (acceptable for this web3 app — same as current access token)
- Reuse detection is handled server-side; if detected, all sessions are revoked and user must re-sign with wallet
- Refresh tokens rotate on every use (old one is invalidated)

