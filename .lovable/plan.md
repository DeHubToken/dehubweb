

# Fix Auth Bugs and Clear Stale Cache

## Summary
Fix the identified bugs (token expiry mismatch, stale comments, redundant connector) and add a one-time cache/data clear for existing testers to ensure a clean slate after the auth flow changes.

## Changes

### 1. Fix token expiry mismatch in `src/lib/wagmi.ts`
**Bug:** `TOKEN_EXPIRY_MS` is set to 7 days (line 32), but the actual token lifetime is 24 hours (matching `src/lib/api/dehub/core.ts`). This means Wagmi thinks a session is valid for 7 days when it actually expires after 24 hours.
- Change `7 * 24 * 60 * 60 * 1000` to `24 * 60 * 60 * 1000`

### 2. Fix stale comments
- **`src/lib/web3auth.ts` (lines 4-6):** Remove "Matches mobile: deploy Smart Account (empty tx) before signing" and "For DeHub auth we recover EOA from ERC-6492 inner sig and send that" from the file header comment
- **`src/lib/web3auth.ts` (lines 362-366):** Remove "Smart Account must be deployed (empty tx) before signing - matches mobile. For DeHub auth we send recovered EOA address + inner ECDSA sig." from `initWeb3Auth` JSDoc
- **`src/contexts/AuthContext.tsx` (lines 5-6):** Remove "(no AA - DeHub backend requires standard ECDSA signatures)" from the file header comment. The app does use AA via Pimlico for on-chain transactions; it's just not needed for auth signing anymore.

### 3. Remove redundant `injected()` connector from `src/lib/wagmi.ts`
RainbowKit's wallet connectors (MetaMask, Phantom, Trust, Rabby) already register injected providers via EIP-6963 discovery. The explicit `injected()` connector can cause duplicate entries and conflicts. The in-app browser auto-connect in `AuthContext.tsx` (line 488) already searches connectors by ID and will find the RainbowKit-registered injected connector.
- Remove `import { injected } from 'wagmi/connectors'`
- Remove `injected()` from the `connectors` array

### 4. One-time stale data clear for existing testers
Add a versioned migration flag in `src/App.tsx` (or a new utility) that runs once on first load:
- Check `localStorage` for a key like `dehub_cache_version`
- If it's missing or less than the current version (e.g., `"2"`):
  - Clear `dehub_token`, `dehub_token_timestamp`, `dehub_wallet`, `dehub_user`, `dehub_connection_source`, `dehub_deployed_sa`
  - Clear all wagmi/WC/Web3Auth keys
  - Clear React Query cache
  - Set `dehub_cache_version` to `"2"`
- This is a clean, removable pattern -- bump the version number for future breaking changes, or remove the block entirely when no longer needed

This will be implemented as a small function called at the top of `App.tsx` (before React renders), so it runs synchronously on module load. Existing users get a fresh start; new users are unaffected.

## Technical Details

```text
Files to edit:
  1. src/lib/wagmi.ts        -- Fix expiry, remove injected()
  2. src/lib/web3auth.ts      -- Fix stale comments
  3. src/contexts/AuthContext.tsx -- Fix stale comment
  4. src/App.tsx              -- Add one-time cache clear
```

