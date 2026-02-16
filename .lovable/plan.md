

# Fix: "Unknown Account" Error for External Wallet Posts

## Problem
After fixing the chain switching, Bill's post now fails with `"unknown account"` (error code `-32000`). This happens because `getConnectorClient(wagmiConfig)` is called **without a `chainId` parameter**, so wagmi may return a client bound to the wrong chain or a stale transport. The RPC node then rejects `eth_sendTransaction` because it doesn't hold the private key for the `from` address.

## Root Cause
In `getActiveProvider()` (line 31), the call:
```
const client = await getConnectorClient(wagmiConfig);
```
...doesn't specify which chain to use. Wagmi docs confirm that `getConnectorClient` accepts a `chainId` option to bind the returned client to the correct chain. Without it, the client may use the default chain's transport (public RPC) instead of routing through the wallet connector on the target chain.

## Solution
Thread the target `chainId` through the provider acquisition so wagmi returns a properly-configured client.

## Technical Details

### File: `src/lib/contracts/aa-utils.ts`

**Change 1** - Update `getActiveProvider` to accept an optional `chainId`:
```typescript
async function getActiveProvider(chainId?: number): Promise<any> {
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) return web3authProvider;

  try {
    const client = await getConnectorClient(wagmiConfig, {
      ...(chainId ? { chainId } : {}),
    });
    return client;
  } catch {
    throw new Error('No wallet connected. Please sign in first.');
  }
}
```

**Change 2** - Update `writeContractAA` to accept and pass `chainId`:
- Add `chainId?: number` to the options parameter
- Pass it to `getActiveProvider(options?.chainId)`

**Change 3** - Update `switchChain` to pass `chainId` to `getActiveProvider`:
```typescript
const provider = await getActiveProvider(chainId);
```

**Change 4** - Update callers in `stream-collection.ts` and `stream-controller.ts`:
- Pass `chainId` in the options when calling `writeContractAA`:
```typescript
const result = await writeContractAA(
  chainConfig.streamCollection,
  streamCollectionInterface,
  'mint',
  [...args],
  { context: 'mint NFT', chainId }
);
```

### What This Fixes
- External wallets (WalletConnect) get a properly chain-bound connector client
- The `eth_sendTransaction` call routes through the wallet app instead of hitting a public RPC
- No impact on Web3Auth/smart wallet users (they use Web3Auth provider, not wagmi)

