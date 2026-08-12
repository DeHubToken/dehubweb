import { defineChain } from 'viem';

/**
 * Robinhood Chain — an Arbitrum Orbit L2 settling to Ethereum, with ETH as the
 * gas token.
 *
 * Not in `viem/chains`, so it is defined here rather than imported. Every
 * address below was read off chain 4663 itself.
 */

export const ROBINHOOD_CHAIN_ID = 4663 as const;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630 as const;

export const ROBINHOOD_EXPLORER_URL = 'https://robinhoodchain.blockscout.com';

/** Public sequencer RPC. Swapped for the Alchemy endpoint when a key is set. */
export const ROBINHOOD_PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com';

export const robinhood = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_PUBLIC_RPC], webSocket: ['wss://feed.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: ROBINHOOD_EXPLORER_URL },
  },
  contracts: {
    // Canonical Multicall3, deployed at the usual address — wagmi batches
    // reads through this, and without it every balance read is its own
    // round-trip.
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_CHAIN_ID,
  name: 'Robinhood Chain Testnet',
  testnet: true,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.chain.robinhood.com'],
      webSocket: ['wss://feed.testnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

/**
 * Token addresses on Robinhood Chain.
 *
 * USDT and USDC are the standard Arbitrum-gateway bridges of their L1
 * contracts and keep 6 decimals — note that this differs from BNB Chain,
 * where both are 18. Reusing a decimals constant across chains is how a tip
 * ends up a trillion times too large.
 */
export const ROBINHOOD_TOKENS = {
  /** Native ETH. The v3 controller reads the zero address as "native". */
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  USDT: '0xe246bC49b0598D7cD9F0Ead48b885034f1254380',
  USDC: '0x80E0e24718DBFcaD49eCaa6f1e6C89A190586cA8',
  /** Global Dollar — Robinhood's own stablecoin, listed for completeness. */
  USDG: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
} as const;

/**
 * DHB is not on Robinhood Chain yet.
 *
 * This is the address it will have, not a stand-in: Robinhood Chain runs the
 * standard Arbitrum token bridge, and the live L2 Gateway Router answers
 * `calculateL2TokenAddress(0x99BB…8EC0)` — DHB on Ethereum — with the address
 * below. It holds no code today. Bridging DHB from L1 deploys it there, and
 * this config starts working with no code change.
 */
export const DHB_ROBINHOOD_PENDING_BRIDGE_ADDRESS =
  '0x7Ae0d21a4c650C857051814c11A82F5E9Ca64b89';

/**
 * Whether DHB has actually been bridged. Flipped by env once it has, which is
 * what un-hides DHB in the pickers on this chain.
 */
export const IS_DHB_LIVE_ON_ROBINHOOD =
  import.meta.env.VITE_DHB_ROBINHOOD_BRIDGED === 'true';

/**
 * Whether Robinhood Chain is offered to users at all.
 *
 * The v3 stream contracts are deployed per environment, so the addresses
 * arrive by env rather than being baked in. Until both are set the chain stays
 * out of every picker — an entry whose controller address is empty is an
 * option that fails the moment someone presses send.
 *
 * Lives here rather than beside the picker so `lib/chains/constants` can read
 * it without importing a component.
 */
export const ROBINHOOD_ENABLED = Boolean(
  import.meta.env.VITE_STREAM_CONTROLLER_ROBINHOOD &&
    import.meta.env.VITE_STREAM_COLLECTION_ROBINHOOD,
);

/**
 * Robinhood Chain runs the v3 stream contracts, whose signatures are EIP-712
 * rather than v1's packed `personal_sign`. Clients branch on this.
 */
export function isV3Chain(chainId: number): boolean {
  return chainId === ROBINHOOD_CHAIN_ID || chainId === ROBINHOOD_TESTNET_CHAIN_ID;
}
