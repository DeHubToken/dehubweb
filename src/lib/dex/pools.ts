/**
 * Community pools on /dex.
 *
 * DHB/USD is the house book. Anyone can open another for any token on Base,
 * Ethereum, Robinhood Chain or Solana by paying the $100 listing fee, which is
 * always settled as DHB to the treasury: a wallet short of DHB swaps what it
 * does hold on Base into DHB first, in the same transaction where it can. The
 * dex-pool-create function confirms the transfer on chain before the pool
 * exists, so the fee cannot be skipped by writing the row directly.
 */
import { Interface, formatUnits, parseUnits } from 'ethers';
import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getERC20Balance, writeContractAA } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID, CHAIN_CONFIGS, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_EXPLORER_URL, ROBINHOOD_TOKENS } from '@/lib/chains/robinhood';
import { SOLANA_EXPLORER_URL } from '@/lib/chains/solana';
import { NATIVE, quoteSwap, runSwap, type SwapCall } from './evm-swap';

export type PoolChain = 'base' | 'ethereum' | 'robinhood' | 'solana';
export const POOL_CHAINS: PoolChain[] = ['base', 'ethereum', 'robinhood', 'solana'];
export const POOL_FEE_USD = 100;
export const DEX_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

export interface PoolChainInfo {
  name: string;
  /** EVM chain id; null for Solana. */
  chainId: number | null;
  usdc: string;
  usdcDecimals: number;
  explorer: string;
  /** Address page on the explorer, for a token or a wallet. */
  address: (address: string) => string;
  tx: (hash: string) => string;
}

export const POOL_CHAIN_INFO: Record<PoolChain, PoolChainInfo> = {
  base: {
    name: 'Base', chainId: BASE_CHAIN_ID, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', usdcDecimals: 6,
    explorer: 'https://basescan.org', address: (a) => `https://basescan.org/token/${a}`, tx: (h) => `https://basescan.org/tx/${h}`,
  },
  ethereum: {
    name: 'Ethereum', chainId: ETH_CHAIN_ID, usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', usdcDecimals: 6,
    explorer: 'https://etherscan.io', address: (a) => `https://etherscan.io/token/${a}`, tx: (h) => `https://etherscan.io/tx/${h}`,
  },
  robinhood: {
    name: 'Robinhood Chain', chainId: ROBINHOOD_CHAIN_ID, usdc: ROBINHOOD_TOKENS.USDC, usdcDecimals: 6,
    explorer: ROBINHOOD_EXPLORER_URL, address: (a) => `${ROBINHOOD_EXPLORER_URL}/token/${a}`, tx: (h) => `${ROBINHOOD_EXPLORER_URL}/tx/${h}`,
  },
  solana: {
    name: 'Solana', chainId: null, usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', usdcDecimals: 6,
    explorer: SOLANA_EXPLORER_URL, address: (a) => `${SOLANA_EXPLORER_URL}/token/${a}`, tx: (h) => `${SOLANA_EXPLORER_URL}/tx/${h}`,
  },
};

export interface DexPool {
  id: string;
  chain: PoolChain;
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  image_url: string | null;
  creator_address: string;
  fee_tx_hash: string;
  fee_dhb: number;
  fee_usd: number;
  created_at: string;
}

export interface TokenCheck {
  exists: boolean;
  pool?: DexPool;
  token?: { symbol: string; name: string; decimals: number; imageUrl: string | null; priceUsd: number | null };
  feeUsd?: number;
  feeDhb?: number | null;
  dhbUsd?: number | null;
}

/** The path a pool lives at. Solana mints keep their case; EVM addresses are lowercase. */
export const poolPath = (pool: Pick<DexPool, 'chain' | 'token_address'>) => `/dex/${pool.chain}/${pool.token_address}`;

export function isPoolChain(value: unknown): value is PoolChain {
  return typeof value === 'string' && (POOL_CHAINS as string[]).includes(value);
}

export function isTokenAddress(chain: PoolChain, value: string): boolean {
  return chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim()) : /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export const normaliseTokenAddress = (chain: PoolChain, value: string) => chain === 'solana' ? value.trim() : value.trim().toLowerCase();

// Postgres numerics arrive as strings; the rest of the page does arithmetic on these.
const toPool = (row: Record<string, unknown>): DexPool => ({ ...(row as unknown as DexPool), fee_dhb: Number(row.fee_dhb), fee_usd: Number(row.fee_usd) });

export async function listPools(): Promise<DexPool[]> {
  const { data, error } = await supabase.from('dex_pools' as never).select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toPool);
}

export async function getPool(chain: PoolChain, tokenAddress: string): Promise<DexPool | null> {
  const { data, error } = await supabase.from('dex_pools' as never).select('*')
    .eq('chain', chain).eq('token_address', normaliseTokenAddress(chain, tokenAddress)).maybeSingle();
  if (error) throw error;
  return data ? toPool(data as Record<string, unknown>) : null;
}

/** Unwrap the server's own refusal instead of supabase-js's "non-2xx status code". */
async function callPoolFunction<T>(body: Record<string, unknown>, authed: boolean): Promise<T> {
  const { data, error } = await supabase.functions.invoke('dex-pool-create', { body, headers: authed ? dehubAuthHeaders() : {} });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    try { detail = context ? (await context.json())?.error : undefined; } catch { /* keep the generic message */ }
    throw new Error(detail || error.message);
  }
  return data as T;
}

export const checkToken = (chain: PoolChain, tokenAddress: string) =>
  callPoolFunction<TokenCheck>({ check: true, chain, tokenAddress: tokenAddress.trim() }, false);

export async function uploadPoolImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller');
  const extension = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png';
  const path = `dex-pools/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('community-media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from('community-media').getPublicUrl(path).data.publicUrl;
}

export async function setPoolImage(poolId: string, imageUrl: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(supabase.rpc('set_dex_pool_image' as never, { p_pool_id: poolId, p_image_url: imageUrl } as never), walletAddress);
  if (error) throw error;
}

// ── Paying the listing fee ────────────────────────────────────────────────

export type FeeAssetSymbol = 'DHB' | 'ETH' | 'USDC' | 'USDT';
export interface FeeAsset { symbol: FeeAssetSymbol; address: string; decimals: number }
export const FEE_ASSETS: FeeAsset[] = [
  { symbol: 'DHB', address: CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken, decimals: 18 },
  { symbol: 'ETH', address: NATIVE, decimals: 18 },
  { symbol: 'USDC', address: POOL_CHAIN_INFO.base.usdc, decimals: 6 },
  { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
];
/** Swapping into the fee overshoots slightly so slippage never leaves it short; the rest stays with the payer. */
const SWAP_HEADROOM = 1.03;
const erc20 = new Interface(['function transfer(address to,uint256 amount) returns (bool)']);

export interface FeePlan {
  asset: FeeAsset;
  feeDhb: bigint;
  /** Input spent when the fee is paid by swapping into DHB; null when paying in DHB. */
  swapIn: bigint | null;
  swap: SwapCall | null;
}

/** DHB needed for the fee, in wei, at the price the server will check against. */
export const feeDhbUnits = (feeDhb: number) => parseUnits(String(Math.ceil(feeDhb)), 18);

export async function planFee(asset: FeeAsset, feeDhb: number, assetUsd: number, walletAddress: string): Promise<FeePlan> {
  const dhbUnits = feeDhbUnits(feeDhb);
  const dhb = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
  if (asset.symbol === 'DHB') {
    const balance = await getERC20Balance(dhb, walletAddress, BASE_CHAIN_ID);
    if (balance < dhbUnits) throw new Error(`Not enough DHB on Base: ${formatUnits(dhbUnits, 18)} needed`);
    return { asset, feeDhb: dhbUnits, swapIn: null, swap: null };
  }
  if (!(assetUsd > 0)) throw new Error(`No ${asset.symbol} price is available right now`);
  const swapIn = parseUnits((POOL_FEE_USD * SWAP_HEADROOM / assetUsd).toFixed(asset.decimals === 6 ? 6 : 12), asset.decimals);
  const swap = await quoteSwap({ chainId: BASE_CHAIN_ID, tokenIn: asset.address, tokenOut: dhb, amountIn: swapIn, recipient: walletAddress, slippageBps: 100 });
  if (swap.minAmountOut < dhbUnits) throw new Error(`That ${asset.symbol} does not swap into enough DHB right now`);
  return { asset, feeDhb: dhbUnits, swapIn, swap };
}

/** Pay the fee and return the DHB transfer hash the server verifies. */
export async function payFee(plan: FeePlan, walletAddress: string): Promise<string> {
  const dhb = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
  if (plan.swap) {
    // One user operation on the built-in wallet: approve, swap, then the transfer.
    const result = await runSwap(plan.swap, walletAddress, [{ to: dhb, data: erc20.encodeFunctionData('transfer', [DEX_TREASURY, plan.feeDhb]) as `0x${string}` }]);
    if (result.followUpHash) return result.followUpHash;
    return result.hash;
  }
  const tx = await writeContractAA(dhb, erc20, 'transfer', [DEX_TREASURY, plan.feeDhb], { chainId: BASE_CHAIN_ID, context: 'DEX pool listing fee' });
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error('The fee transfer did not confirm');
  return receipt.hash || tx.hash;
}

export const createPool = (input: { chain: PoolChain; tokenAddress: string; txHash: string; imageUrl?: string | null }) =>
  callPoolFunction<{ pool: DexPool }>({ ...input }, true).then((result) => toPool(result.pool as unknown as Record<string, unknown>));
