

# Fix: "No wallet connected" Error for External Wallets

## Problem
The previous `getWeb3AuthProvider()` fix worked -- it now correctly returns `null` for external wallet users. But `getConnectorClient(wagmiConfig)` is **also throwing**, causing the "No wallet connected" error. This happens because `getConnectorClient` requires a fully active connector session, which may not be available (e.g., WalletConnect relay not ready, connector in reconnecting state, etc.).

## Key Insight
For the external wallet (wagmi) path, we don't actually need `getConnectorClient` at all:
- `writeContractAA` already uses `sendTransaction(wagmiConfig, ...)` which internally resolves the connector
- `switchChain` should use wagmi's own `switchChain` action instead of raw `provider.request`
- Gas estimation and reads can use a public RPC provider directly (no signing needed)

The only path that needs a raw EIP-1193 provider is Web3Auth. For wagmi, we should use wagmi's action-based API throughout.

## Solution
Restructure `getActiveProvider` to not require `getConnectorClient` for external wallets. Instead, detect external wallets via `getAccount(wagmiConfig).isConnected` and use wagmi actions for all operations.

## Technical Details

### File: `src/lib/contracts/aa-utils.ts`

**Change 1** -- Simplify `getActiveProvider` to detect wagmi via `getAccount`:

```typescript
async function getActiveProvider(chainId?: number): Promise<{ provider: any; isWeb3Auth: boolean }> {
  // Check Web3Auth first (social login)
  const web3authProvider = getWeb3AuthProvider();
  if (web3authProvider) return { provider: web3authProvider, isWeb3Auth: true };

  // Check wagmi (external wallet) -- use getAccount instead of getConnectorClient
  const account = getAccount(wagmiConfig);
  if (account.isConnected) {
    return { provider: null, isWeb3Auth: false };
  }

  throw new Error('No wallet connected. Please sign in first.');
}
```

**Change 2** -- For gas estimation when `!isWeb3Auth`, use a direct JSON-RPC fetch to public RPC instead of `provider.request`:

```typescript
// In writeContractAA, replace gas estimation:
if (isWeb3Auth) {
  // Use web3auth provider directly
  gasEstimate = await provider.request({ method: 'eth_estimateGas', params: [...] });
} else {
  // Use public RPC for read-only gas estimation
  const chainConfig = CHAIN_CONFIGS[options?.chainId || BASE_CHAIN_ID];
  const rpcUrl = chainConfig?.rpcUrl || 'https://base-rpc.publicnode.com';
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_estimateGas',
      params: [{ from: fromAddress, to: contractAddress, data, value: toHex(options?.value ?? 0) }],
    }),
  });
  const result = await response.json();
  gasEstimate = result.result;
}
```

**Change 3** -- For `switchChain`, use wagmi's `switchChain` action when `!isWeb3Auth`:

```typescript
import { switchChain as wagmiSwitchChain } from '@wagmi/core';

export async function switchChain(chainId: ChainId): Promise<void> {
  await initChainRpcUrls();
  const { provider, isWeb3Auth } = await getActiveProvider(chainId);

  if (!isWeb3Auth) {
    // Use wagmi's switchChain action -- handles connector routing internally
    try {
      await wagmiSwitchChain(wagmiConfig, { chainId: chainId as any });
      console.log('[AA] Switched chain via wagmi');
      return;
    } catch (error) {
      console.warn('[AA] wagmi switchChain failed:', error);
      // Wagmi config only has Base -- if already on Base, ignore
      if (chainId === BASE_CHAIN_ID) return;
      throw new Error(`Please switch to the correct network in your wallet app.`);
    }
  }

  // Web3Auth path: use raw provider.request (existing logic)
  // ... keep existing wallet_switchEthereumChain logic for Web3Auth
}
```

**Change 4** -- For `readContract`, use public RPC fetch instead of `provider.request`:

```typescript
export async function readContract<T>(
  contractAddress: string,
  contractInterface: Interface,
  functionName: string,
  args: unknown[] = [],
  chainId?: ChainId
): Promise<T> {
  const data = contractInterface.encodeFunctionData(functionName, args);
  const rpcChainId = chainId || BASE_CHAIN_ID;
  const chainConfig = CHAIN_CONFIGS[rpcChainId];
  const rpcUrl = chainConfig?.rpcUrl || 'https://base-rpc.publicnode.com';

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_call',
      params: [{ to: contractAddress, data }, 'latest'],
    }),
  });
  const result = await response.json();
  const decoded = contractInterface.decodeFunctionResult(functionName, result.result);
  return decoded[0] as T;
}
```

### What This Fixes
- External wallets no longer need `getConnectorClient` (which was throwing)
- All wagmi operations use wagmi's action-based API (`sendTransaction`, `switchChain`, `waitForTransactionReceipt`) which handle connector resolution internally
- Read-only RPC calls (gas estimation, `eth_call`) use direct JSON-RPC to public RPC -- no wallet involvement needed
- Web3Auth path is completely unchanged

