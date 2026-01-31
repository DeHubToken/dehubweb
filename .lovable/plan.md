
# Fix Phantom and Rabby Wallet Button Bug

## Problem
Clicking **Phantom** or **Rabby** wallet buttons in the login modal incorrectly triggers MetaMask connection. This is due to a copy-paste error where both buttons call `handleWalletConnect('metamask')` instead of their own wallet types.

## Root Cause Analysis

Looking at `LoginModal.tsx` lines 344-368:

```typescript
// Line 345 - Phantom button (BUG!)
onClick={() => handleWalletConnect('metamask')}  

// Line 358 - Rabby button (BUG!)
onClick={() => handleWalletConnect('metamask')}  
```

Both call `'metamask'` instead of their respective wallet identifiers.

## Solution Overview

### How Web3Auth Handles Wallets
Web3Auth uses EIP-6963 for wallet discovery. The `WALLET_CONNECTORS.METAMASK` connector connects to the **injected provider** (window.ethereum). When multiple wallets are installed:
- All EIP-6963 compatible wallets (MetaMask, Phantom, Rabby) inject themselves
- The connector uses whichever one is the active/default injected provider

### The Fix
Since Phantom and Rabby are **injected wallets** (like MetaMask), they all use the same underlying connector. The cleanest solution is to:

1. **Consolidate injected wallets** into a single "Browser Wallet" option that triggers EIP-6963 selection
2. **Keep WalletConnect and Coinbase** as separate options (they have their own connectors)

Alternatively, if users expect to see Phantom/Rabby buttons:
- Keep all buttons visible
- All injected wallets (MetaMask, Phantom, Rabby) will use the same connector
- The user's default browser wallet will be triggered

---

## Implementation Plan

### File: `src/components/app/LoginModal.tsx`

**Option A: Consolidate to "Browser Wallet" (Recommended)**

Replace the 4 injected wallet buttons with 1:

```typescript
const renderWalletsStep = () => (
  <div className="space-y-3">
    {/* Browser Wallet - uses EIP-6963 to detect installed wallets */}
    <Button
      onClick={() => handleWalletConnect('metamask')}
      disabled={isConnecting}
      className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
    >
      {activeProvider === 'metamask' ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Wallet className="w-5 h-5" />
      )}
      <span>Browser Wallet</span>
    </Button>

    <Button
      onClick={() => handleWalletConnect('walletconnect')}
      ...
    </Button>

    <Button
      onClick={() => handleWalletConnect('coinbase')}
      ...
    </Button>
  </div>
);
```

**Option B: Keep Individual Buttons (Visual preference only)**

If you want to keep the visual appearance of separate wallets, fix the `activeProvider` display but keep all using the injected connector:

```typescript
// Line 344-355: Fix Phantom button
<Button
  onClick={() => {
    setActiveProvider('phantom');
    handleWalletConnect('metamask'); // Still uses injected connector
  }}
  disabled={isConnecting}
  ...
>
  {activeProvider === 'phantom' ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : (
    <PhantomIcon />
  )}
  <span>Phantom</span>
</Button>

// Line 357-368: Fix Rabby button  
<Button
  onClick={() => {
    setActiveProvider('rabby');
    handleWalletConnect('metamask'); // Still uses injected connector
  }}
  disabled={isConnecting}
  ...
>
  {activeProvider === 'rabby' ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : (
    <RabbyIcon />
  )}
  <span>Rabby</span>
</Button>
```

---

## Technical Details

| Change | File | Description |
|--------|------|-------------|
| Fix Phantom button | `LoginModal.tsx` | Update onClick to properly set activeProvider |
| Fix Rabby button | `LoginModal.tsx` | Update onClick to properly set activeProvider |
| Update handleWalletConnect | `LoginModal.tsx` | Accept provider param for loading state tracking |

## Important Note
All injected browser wallets (MetaMask, Phantom, Rabby) share the same `window.ethereum` interface. Web3Auth's `WALLET_CONNECTORS.METAMASK` connects to whichever wallet is the **active injected provider** in the browser. 

If a user clicks "Phantom" but MetaMask is their default, MetaMask will open. This is a browser limitation, not a code bug. The "Browser Wallet" consolidation (Option A) is more honest UX.

## Recommendation
I recommend **Option A** (consolidate to "Browser Wallet") for honest UX, but can implement **Option B** if you prefer keeping the individual wallet icons for branding purposes.
