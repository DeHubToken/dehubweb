/**
 * Solana — the one supported chain that is not EVM.
 *
 * Kept beside `robinhood.ts` and shaped like it on purpose: both are chains
 * DeHub supports before DHB exists on them, and that shape (a pending token
 * address plus a flag that un-hides it) is the pattern that let Robinhood ship
 * without a second code change on the day it bridged.
 *
 * The difference is that Robinhood's address was *derivable* — its Arbitrum
 * gateway answers `calculateL2TokenAddress` for DHB on L1, so the address was
 * known before the token existed. Solana has no such thing: an SPL mint is a
 * fresh keypair chosen at creation, so the address cannot be predicted and has
 * to arrive by env once the mint is made.
 *
 * Chain ids 101 / 103 are the community convention for mainnet-beta and
 * devnet, and they are what the API already uses — see the backend's
 * `ChainId.SOLANA_MAINNET`.
 */

export const SOLANA_MAINNET_CHAIN_ID = 101 as const;
export const SOLANA_DEVNET_CHAIN_ID = 103 as const;

export const SOLANA_EXPLORER_URL = 'https://solscan.io';

/**
 * Broadcast-friendly public RPC.
 *
 * NOT `api.mainnet-beta.solana.com`: that endpoint refuses `sendTransaction`
 * from a browser origin with a 403, which is a confusing way to discover you
 * picked the wrong default. Override with a paid endpoint (Helius, Alchemy,
 * QuickNode) via env for anything with real traffic — the public node
 * rate-limits hard.
 */
export const SOLANA_PUBLIC_RPC =
  (import.meta.env.VITE_SOLANA_MAINNET_RPC as string) || 'https://solana-rpc.publicnode.com';

export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

export function solanaRpcUrl(chainId: number = SOLANA_MAINNET_CHAIN_ID): string {
  return chainId === SOLANA_DEVNET_CHAIN_ID ? SOLANA_DEVNET_RPC : SOLANA_PUBLIC_RPC;
}

/** The SPL token program every standard mint belongs to. */
export const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Token-2022 — a separate program, so its accounts need their own lookup. */
export const SPL_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/**
 * Wrapped SOL. Used as the *identifier* for native SOL throughout DeHub — the
 * API's `NATIVE_SOL_MINT` is this address — rather than as a token anyone
 * holds a balance of.
 */
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

/** Mints DeHub shows by name. Anything else with a balance still appears, unnamed. */
export const SOLANA_TOKENS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

/**
 * DHB is not on Solana yet.
 *
 * Unlike the Robinhood bridge address, this one cannot be computed ahead of
 * time — see the header. It arrives by env on the day the mint is created, and
 * every surface that reads `dhbSolanaMint()` starts working with no code
 * change: the wallet's DHB row begins summing Solana alongside Base and BNB,
 * and DHB becomes a lockable token on chain 101.
 */
export function dhbSolanaMint(): string | null {
  const raw = (import.meta.env.VITE_DHB_SOLANA_MINT as string | undefined)?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

/**
 * Whether DHB actually exists on Solana. Everything DHB-denominated on this
 * chain — tips, PPV in DHB, token gating — is gated on it, because a picker
 * offering a token with no mint behind it is an option that fails the moment
 * somebody presses send.
 */
export const IS_DHB_LIVE_ON_SOLANA = !!dhbSolanaMint();

export function isSolanaChainId(chainId: number): boolean {
  return chainId === SOLANA_MAINNET_CHAIN_ID || chainId === SOLANA_DEVNET_CHAIN_ID;
}

/** Solscan wants an explicit cluster for anything that is not mainnet. */
export function solanaExplorerAddressUrl(
  address: string,
  chainId: number = SOLANA_MAINNET_CHAIN_ID,
): string {
  const suffix = chainId === SOLANA_DEVNET_CHAIN_ID ? '?cluster=devnet' : '';
  return `${SOLANA_EXPLORER_URL}/account/${address}${suffix}`;
}
