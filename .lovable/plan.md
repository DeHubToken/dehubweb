

# Fix: Handle Wallets That Don't Support Chain Switching

## Problem
Bill's external wallet doesn't implement `wallet_switchEthereumChain` (error `-32601`: method not found). The current code unconditionally calls this method, so even if the wallet is already on Base, the mint fails.

## Solution
Update `switchChain` in `aa-utils.ts` to:

1. **Check the current chain first** -- call `eth_chainId` and skip switching entirely if already on the target chain
2. **Handle error code `-32601` gracefully** -- if the method doesn't exist, check if the wallet is already on the right chain; if so, proceed silently; if not, throw a helpful error telling the user to manually switch chains in their wallet app

## Technical Details

### File: `src/lib/contracts/aa-utils.ts`

In the `switchChain` function (starting around line 49):

```typescript
export async function switchChain(chainId: ChainId): Promise<void> {
  await initChainRpcUrls();
  const provider = await getActiveProvider();
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) throw new Error(`Unsupported chain ID: ${chainId}`);

  const targetChainHex = chainIdToHex(chainId);

  // 1. Check current chain -- skip if already correct
  try {
    const currentChainHex = await provider.request({ method: 'eth_chainId' }) as string;
    if (parseInt(currentChainHex, 16) === chainId) {
      console.log('[AA] Already on correct chain:', chainConfig.name);
      return;
    }
  } catch {
    // If we can't check, proceed with switch attempt
  }

  // 2. Try switching with retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainHex }],
      });
      console.log('[AA] Switched to chain:', chainConfig.name);
      return;
    } catch (switchError: any) {
      const code = switchError?.code ?? switchError?.data?.code;

      // Chain not added -- try adding it
      if (code === 4902 || switchError?.message?.includes('Unrecognized chain')) {
        // ... existing wallet_addEthereumChain logic (unchanged)
      }

      // Method not supported -- wallet can't switch programmatically
      if (code === -32601 || code === -32603 ||
          switchError?.message?.includes('does not exist')) {
        console.warn('[AA] wallet_switchEthereumChain not supported');
        throw new Error(
          `Please switch to ${chainConfig.name} network in your wallet app and try again.`
        );
      }

      // Transient error on first attempt -- retry
      if (attempt === 0) {
        console.warn('[AA] Chain switch attempt failed, retrying...', switchError);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      throw new Error(`Failed to switch to ${chainConfig.name} network`);
    }
  }
}
```

### What This Fixes
- If Bill's wallet is already on Base, the mint proceeds without ever calling `wallet_switchEthereumChain`
- If he's on the wrong chain, he gets a clear message: "Please switch to Base network in your wallet app and try again" instead of a cryptic failure
- No impact on smart wallet / social login users (they support chain switching fine)
