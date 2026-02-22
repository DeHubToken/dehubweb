

# Use Web3Auth's Built-in Fiat On-Ramp for Non-DHB Tokens

## Overview

Web3Auth v10 already includes a built-in fiat on-ramp aggregator as part of its Wallet Services. Your app already configures `walletServicesConfig` during Web3Auth init -- we just need to call `showCheckout()` when the user taps "Buy" on ETH, BNB, or USDT. No new API keys, no fees, no extra dependencies.

For DHB, we keep the existing DHub onramp. For everything else, Web3Auth handles it.

## How It Works

- Web3Auth's checkout aggregator supports 30+ on-ramp providers (Stripe, Revolut, MoonPay, etc.)
- Funds go directly to the user's wallet address
- Supports ETH, BNB, USDT, and many more tokens
- Already included in the Web3Auth SDK you have installed

## Changes

### 1. Export a helper from `src/lib/web3auth.ts`

Add a function `showWeb3AuthCheckout()` that:
- Gets the Web3Auth instance (must be initialized and connected)
- Retrieves the built-in wallet services plugin via `web3auth.getPlugin(EVM_PLUGINS.WALLET_SERVICES)`
- Calls `walletServicesPlugin.showCheckout({ show: true })` to open the on-ramp UI

### 2. Update `src/pages/app/FullWalletPage.tsx` - GroupedActionDrawer Buy button

Change the Buy button logic:
- If token is DHB: keep existing `createOnrampSession` flow (DHub's fiat gateway)
- If token is anything else (ETH, BNB, USDT, etc.): call `showWeb3AuthCheckout()` which opens Web3Auth's built-in on-ramp aggregator
- Show a toast if Web3Auth isn't connected (user must be logged in via Web3Auth for this to work)
- For users logged in via external wallets (MetaMask, etc.), fall back to opening a DEX deeplink (Uniswap/PancakeSwap) since Web3Auth checkout requires a Web3Auth session

### 3. Fallback: DEX deeplinks (`src/lib/wallet/buy-links.ts`)

Create a small helper with DEX URLs for external wallet users:
- ETH: Uniswap (Base or Ethereum)
- BNB: PancakeSwap
- USDT: Uniswap with USDT contract address

This is only used when Web3Auth checkout isn't available (external wallet login).

## Technical Details

```text
User taps non-DHB token -> Action Drawer
  -> Taps "Buy"
    -> Is DHB? -> Use existing DHub onramp
    -> Not DHB + Web3Auth session? -> showCheckout() (built-in aggregator)
    -> Not DHB + External wallet? -> Open DEX deeplink (Uniswap/PancakeSwap)
```

The Web3Auth v10 API for checkout:
```typescript
import { EVM_PLUGINS } from '@web3auth/modal';
const plugin = web3auth.getPlugin(EVM_PLUGINS.WALLET_SERVICES);
await plugin.showCheckout({ show: true });
```

No new packages or API keys required. The on-ramp is bundled with Web3Auth's Sapphire Mainnet plan.

