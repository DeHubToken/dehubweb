
# Update Web3Auth Configuration to Match Official Docs

## Overview
Update the Web3Auth configuration in `src/lib/web3auth.ts` to use the `AccountAbstractionProvider` and `SafeSmartAccount` pattern from `@web3auth/account-abstraction-provider` as shown in the official documentation, rather than the built-in `accountAbstractionConfig` option.

## Current State
The current implementation uses:
- Web3Auth Modal's built-in `accountAbstractionConfig` object
- Inline configuration with `smartAccountType: "safe"` and `chains` array
- No separate `EthereumPrivateKeyProvider` or `AccountAbstractionProvider`

## Changes Required

### 1. Install New Package
Add the `@web3auth/account-abstraction-provider` package which provides:
- `AccountAbstractionProvider` - The main AA provider class
- `SafeSmartAccount` - Safe smart account initialization

### 2. Update web3auth.ts Configuration

**New imports:**
```typescript
import { 
  AccountAbstractionProvider, 
  SafeSmartAccount 
} from "@web3auth/account-abstraction-provider";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
```

**Create AccountAbstractionProvider:**
```typescript
const accountAbstractionProvider = new AccountAbstractionProvider({
  config: {
    chainConfig,
    bundlerConfig: {
      url: `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`,
    },
    smartAccountInit: new SafeSmartAccount(),
    paymasterConfig: {
      url: `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`,
    },
  },
});
```

**Create EthereumPrivateKeyProvider:**
```typescript
const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { chainConfig },
});
```

**Update Web3Auth options:**
```typescript
const web3AuthOptions: Web3AuthOptions = {
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  privateKeyProvider,
  accountAbstractionProvider,
  useAAWithExternalWallet: false,
  // ... uiConfig and modalConfig remain the same
};
```

### 3. File Changes Summary

**package.json**
- Add: `"@web3auth/account-abstraction-provider": "^9.7.0"`

**src/lib/web3auth.ts**
- Add imports for `AccountAbstractionProvider`, `SafeSmartAccount`, `EthereumPrivateKeyProvider`
- Create `accountAbstractionProvider` instance with proper Pimlico config
- Create `privateKeyProvider` instance
- Replace `accountAbstractionConfig` object with `accountAbstractionProvider` and `privateKeyProvider` in Web3Auth options

---

## Technical Details

The key difference between the approaches:

**Current (Simplified inline config):**
```typescript
accountAbstractionConfig: {
  smartAccountType: "safe",
  chains: [{ chainId, bundlerConfig, paymasterConfig }],
}
```

**New (Explicit provider pattern from docs):**
```typescript
const accountAbstractionProvider = new AccountAbstractionProvider({
  config: {
    chainConfig,
    bundlerConfig: { url },
    smartAccountInit: new SafeSmartAccount(),
    paymasterConfig: { url },
  },
});

const web3Auth = new Web3Auth({
  privateKeyProvider,
  accountAbstractionProvider,
  useAAWithExternalWallet: false,
});
```

The explicit provider pattern gives more control and follows the recommended pattern from the official Web3Auth documentation for gasless transactions with Pimlico paymaster.
