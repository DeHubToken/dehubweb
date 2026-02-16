
# Fix: "Unknown Account" Error for External Wallet Transactions

## Problem
The `writeContractAA` function sends transactions using raw `provider.request({ method: 'eth_sendTransaction' })` on the viem `WalletClient` returned by `getConnectorClient`. For external wallets (WalletConnect/injected), this routes the request through the **HTTP transport** (public RPC node) instead of the wallet connector. The public RPC doesn't hold the user's private key, so it returns "unknown account."

This works fine for Web3Auth because its provider is a proper EIP-1193 provider that handles signing internally. But the viem WalletClient from wagmi requires using wagmi's `sendTransaction` action to properly route through the wallet connector.

## Solution
Split the transaction sending path in `writeContractAA`:
1. **Web3Auth provider** (social login): Keep using raw `provider.request({ method: 'eth_sendTransaction' })` -- this works correctly
2. **External wallets** (wagmi): Use `sendTransaction` from `@wagmi/core`, which properly routes through the wallet connector

## Technical Details

### File: `src/lib/contracts/aa-utils.ts`

**Change 1** -- Update `getActiveProvider` to also return a flag indicating the provider type:

```typescript
async function getActiveProvider(chainId?: number): Promise<{ provider: any; isWeb3Auth: boolean }> {
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) return { provider: web3authProvider, isWeb3Auth: true };

  try {
    const client = await getConnectorClient(wagmiConfig, {
      ...(chainId ? { chainId: chainId as any } : {}),
    });
    return { provider: client, isWeb3Auth: false };
  } catch {
    throw new Error('No wallet connected. Please sign in first.');
  }
}
```

**Change 2** -- In `writeContractAA`, branch on provider type:

```typescript
import { sendTransaction } from '@wagmi/core';

// Inside writeContractAA, replace the eth_sendTransaction call:

let txHash: string;

if (isWeb3Auth) {
  // Web3Auth EIP-1193 provider -- raw request works
  txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [txParams],
  }) as string;
} else {
  // External wallet via wagmi -- use wagmi's sendTransaction
  // which properly routes through the wallet connector
  txHash = await sendTransaction(wagmiConfig, {
    to: contractAddress as `0x${string}`,
    data: data,
    gas: gasLimit ? BigInt(gasLimit) : undefined,
    value: options?.value ? BigInt(options.value) : undefined,
    ...(options?.chainId ? { chainId: options.chainId as any } : {}),
  });
}
```

**Change 3** -- For the receipt polling, similarly branch:

- Web3Auth: keep using `provider.request({ method: 'eth_getTransactionReceipt' })`
- External wallets: use `waitForTransactionReceipt` from `@wagmi/core` (or keep raw polling against a public provider, which is fine for reads)

**Change 4** -- Update all other callers of `getActiveProvider` (`switchChain`, `readContract`, gas estimation) to destructure the new return type.

### What This Fixes
- External wallet transactions (WalletConnect, MetaMask, etc.) will properly route `eth_sendTransaction` through the wallet for signing
- Web3Auth/smart wallet users are completely unaffected (same code path as before)
- The "unknown account" error is eliminated because the transaction is no longer sent to a public RPC node that doesn't hold keys
