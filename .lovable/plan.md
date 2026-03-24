

## ✅ Refresh Token Integration — IMPLEMENTED

All changes from the approved plan have been applied:

1. **`core.ts`** — Added `setRefreshToken`/`getRefreshToken`/`setTokenExpiresAt`, dynamic expiry via `dehub_token_expires_at`, automatic 401 retry with `attemptTokenRefresh()` + failed queue pattern
2. **`auth.ts`** — `authenticateWallet()` now stores refresh token + dynamic expiry; added `refreshAccessToken()`, `logoutFromServer()`, `logoutAllSessions()`
3. **`types.ts`** — Added `refreshToken?: string` and `expiresIn?: number` to `AuthResponse`
4. **`AuthContext.tsx`** — Proactive 60s timer refreshes token when <2min until expiry; `refreshSession()` tries refresh token before wallet re-sign; `disconnect()` calls `logoutFromServer()`; `isAuthenticated` considers refresh token presence
5. **Tests** — Updated `core.test.ts` for new storage functions (22/22 passing)

## ✅ DM Notification Badge Fix — IMPLEMENTED

1. **`use-messages.ts`** — Removed 1-hour TTL pruning; read timestamps now persist durably. Storage is wallet-scoped (`dehub-read-conversations:<wallet>`) to prevent cross-account contamination.
2. **`dm-socket.ts`** — `emitReadReceipt` now uses a pending queue (in-memory + localStorage backup). Missed receipts auto-flush on socket reconnect.
