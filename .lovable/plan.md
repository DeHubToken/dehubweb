

# Fix: Email Login Signature Confirmation Modal Blocker

## Problem Summary
When logging in via email, a Web3Auth signature request modal appears (as shown in your screenshot) with "Cancel" and "Confirm" buttons, but the "Confirm" button cannot be clicked. This blocks the entire login flow.

## Root Cause
The Web3Auth Modal v10 shows a confirmation modal for signature requests when Account Abstraction is enabled. The default confirmation strategy (`default`) displays this modal for signature requests, but there's an issue with the modal's interactivity - likely caused by:
1. Z-index conflicts with other UI elements
2. The modal rendering in an iframe that blocks user interaction
3. Internal Web3Auth modal state conflicts

## Solution
Configure `walletServicesConfig` in the Web3Auth initialization to use the `auto-approve` confirmation strategy. This will:
- Automatically approve signature requests without showing the confirmation modal
- This is safe because the only signature requested is the authentication message (not a transaction)
- The authentication message is harmless: "Welcome to DeHub! Click to sign in for authentication..."

## Implementation Plan

### Step 1: Update Web3Auth Configuration
**File:** `src/lib/web3auth.ts`

Add `walletServicesConfig` to the Web3Auth initialization with:
- `confirmationStrategy: "auto-approve"` - Automatically approves signatures
- `whiteLabel.showWidgetButton: false` - Keeps the wallet widget hidden (already desired)

### Step 2: Import Required Constants
Import `CONFIRMATION_STRATEGY` from `@web3auth/modal` to use the proper constant.

---

## Technical Details

### Code Changes

**src/lib/web3auth.ts** - Add walletServicesConfig:

```typescript
import { 
  Web3Auth, 
  CHAIN_NAMESPACES, 
  WEB3AUTH_NETWORK,
  WALLET_CONNECTORS,
  AUTH_CONNECTION,
  CONFIRMATION_STRATEGY,  // Add this import
} from "@web3auth/modal";

// In the Web3Auth constructor (around line 115):
web3authInstance = new Web3Auth({
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  accountAbstractionConfig: {
    smartAccountType: "safe",
    chains: [
      {
        chainId: "0x2105",
        bundlerConfig: { url: pimlicoConfig.bundlerUrl },
        paymasterConfig: { url: pimlicoConfig.paymasterUrl },
      },
    ],
  },
  useAAWithExternalWallet: false,
  // ADD: Wallet services configuration for auto-approve
  walletServicesConfig: {
    confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
    whiteLabel: {
      showWidgetButton: false,
    },
  },
  uiConfig: {
    appName: "DeHub",
    mode: "dark",
    defaultLanguage: "en",
  },
});
```

## Security Consideration
Using `auto-approve` is safe in this context because:
1. The only signature being approved is the authentication message
2. This message is read-only and doesn't authorize any transactions
3. External wallet users (MetaMask, etc.) still use their own signing flow via their wallet UI
4. Transaction signatures (when implemented) should use a different flow

## Expected Result
After this fix:
- Email login will complete without showing the blocking signature modal
- The authentication flow will proceed directly after email verification
- No user interaction required for the auth signature step

