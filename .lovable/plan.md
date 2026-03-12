
Root cause confirmed from live requests and current code:
- Route is `/SableRaven_9847`.
- `GET /api/account_info/SableRaven_9847` returns an empty shell object (no `_id`, `address`, `username`).
- Current fallback in `getAccountByUsername` depends on `/api/users_search`, but that endpoint is returning unrelated users for this query, so canonical username recovery fails.
- Notifications still build some profile links from display text, which can keep sending users to non-resolvable handles.

Plan to fix:

1) Harden username resolution in `src/lib/api/dehub/users.ts`
- Add a shared helper to detect “empty shell” account responses.
- Fallback order for `getAccountByUsername`:
  1. exact input
  2. lowercase handle retry (critical for `SableRaven_9847 -> sableraven_9847`)
  3. users_search as last resort (exact match only against username/displayName)
- Keep `address` param across retries.
- Prevent recursive loops by only retrying each candidate once.

2) Make notification profile links safer in `src/pages/app/NotificationsPage.tsx`
- Add a route resolver for actor links:
  - prefer `resolvedUsername`
  - else if display is handle-like (`[a-z0-9_.]+`), use normalized lowercase key
  - else do not create a profile link (avoid broken “display name as URL” navigation)
- Apply this in both 2x2 avatar grid and actors drawer.

3) Keep current profile error behavior, but only after real fallback exhaustion
- `use-dehub-profile.ts` can continue treating empty-shell user as not found.
- With step (1), valid users should resolve before this state.
- Existing URL canonicalization in `use-profile-page.ts` will then auto-replace casing once profile resolves.

Validation checklist after implementation:
- Open `/SableRaven_9847` directly: should load and normalize to canonical handle.
- Click this user from aggregated notifications: should open profile, not “profile not found”.
- Verify a non-handle display name in actor lists is no longer clickable to a broken route.
- Re-test known working profiles (`xluna`, `0xkai`) for no regressions.
