import { defineChain } from 'viem';

/**
 * Arc — Circle's L1, with USDC as the gas token.
 *
 * Not in `viem/chains`, so it is defined here rather than imported. Every
 * address below was read off chain 5042 itself.
 *
 * USDC is both the native currency and an ERC-20 at 0x3600…0000, over the
 * same balance: native reads carry 18 decimals, the ERC-20 interface carries
 * 6. The wallet lists the native side only — listing both would count every
 * dollar twice.
 */

export const ARC_CHAIN_ID = 5042 as const;

export const ARC_EXPLORER_URL = 'https://explorer.arc.io';

export const ARC_PUBLIC_RPC = 'https://rpc.mainnet.arc.io';

export const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_PUBLIC_RPC] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_EXPLORER_URL },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});
