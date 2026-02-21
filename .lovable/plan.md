
# Fix: Restore `injected()` Connector for Mobile In-App Browsers

## Problem
Removing the generic `injected()` connector from `src/lib/wagmi.ts` broke auto-connect in wallet in-app browsers (e.g., Trust Wallet, MetaMask Mobile). Two code paths in `src/contexts/AuthContext.tsx` fall back to `connectors.find(c => c.id === 'injected')`, which now returns `undefined`.

## Solution
Re-add `injected()` to the Wagmi config as a **hidden fallback** -- it won't appear in RainbowKit's UI (RainbowKit only renders its own wallet list), but it will be available for programmatic use in the auto-connect and `connectWallet` flows.

## Changes

### `src/lib/wagmi.ts`
- Re-import `injected` from `wagmi/connectors`
- Add `injected()` back to the `connectors` array with a comment explaining it is a fallback for in-app browser auto-connect only (not shown in RainbowKit UI)

### `src/contexts/AuthContext.tsx`
- Update the comment at line 487 to clarify the fallback chain: generic `injected` is for wallets that inject `window.ethereum` but may not support EIP-6963 discovery

Two lines changed in one file, one import + one array entry in another. No behavioral change on desktop; restores mobile in-app browser auto-connect.
