/**
 * Funding a DHB buy order with whatever the wallet actually holds.
 *
 * The order book is a DHB/USDC pool, so every buy is settled in USDC. That is
 * a detail nobody should have to know: a buyer holding ETH sees a dollar
 * balance, types a dollar amount, and gets a USDC position. This module is
 * the gap between the two — it prices the wallet's spendable assets in
 * dollars, quotes the exact-output swap that turns one of them into the USDC
 * the order needs, and runs swap → approvals → mint.
 *
 * The built-in wallet is a Safe, so the whole sequence is one atomic,
 * sponsored user operation: either the position exists or nothing moved.
 * External wallets sign each step; the swap's receipt is saved before the
 * mint starts so a refresh resumes at the mint rather than swapping twice.
 *
 * Only Base is funded this way. It is the canonical book and the only chain
 * with a deep ETH/USDC route; the BNB book takes BNB-chain USDC directly.
 */
import { Interface, formatUnits, parseUnits } from 'ethers';
import { getActiveProvider, readContract, waitForERC20Balance, writeBatchAA, writeContractAA } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { WalletToken } from '@/lib/wallet/tokens';
import type { TokenPrices } from '@/hooks/use-token-prices';
import { isSmartWalletSession } from '@/lib/connection-source';
import { DEX_CHAINS } from './v4';
import { mintSellPosition, quoteSellPosition, recoverMint, type SellInput } from './sell';
import { readWithTimeout, type OrderStage } from './read-timeout';

export const FUNDING_CHAIN = BASE_CHAIN_ID;
const USDC = DEX_CHAINS[BASE_CHAIN_ID].usdc;
const WETH = '0x4200000000000000000000000000000000000006';
const USDT = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
/** Room for the price to move between quote and execution. Unused input is refunded. */
const SLIPPAGE_BPS = 150n;
/** Kept back from a MAX spend so slippage and a rounding step never push the swap over the balance. */
const MAX_SPEND_RESERVE = 0.985;
const SWAP_DEADLINE_SECONDS = 120;

export type FundingSymbol = 'USDC' | 'ETH' | 'USDT';
export interface FundingAsset {
  symbol: FundingSymbol;
  /** '0x0' for native ETH. */
  address: string;
  decimals: number;
  balance: bigint;
  /** Dollar value of the whole balance. */
  usd: number;
  /** The most this asset can fund, in whole dollars of USDC, after the swap reserve. */
  spendableUsd: number;
  /** Swap fee tiers to try, cheapest first. Empty for USDC itself. */
  feeTiers: number[];
}

const ROUTES: Record<FundingSymbol, { address: string; decimals: number; feeTiers: number[] }> = {
  USDC: { address: USDC, decimals: 6, feeTiers: [] },
  ETH: { address: '0x0', decimals: 18, feeTiers: [500, 3000] },
  USDT: { address: USDT, decimals: 6, feeTiers: [100, 500] },
};

const quoter = new Interface([
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
const router = new Interface([
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
  'function refundETH() payable',
  'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])',
]);
const erc20 = new Interface([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
]);
const permit2 = new Interface(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);
const positionManager = new Interface([
  'function multicall(bytes[] data) payable returns (bytes[])',
  'function modifyLiquidities(bytes unlockData,uint256 deadline) payable',
]);

/**
 * What the wallet can spend on a Base buy order, priced in dollars and
 * ordered by preference: USDC needs no swap, then whatever is worth most.
 */
export function fundingAssets(tokens: WalletToken[], prices: TokenPrices): FundingAsset[] {
  const assets: FundingAsset[] = [];
  for (const symbol of Object.keys(ROUTES) as FundingSymbol[]) {
    const route = ROUTES[symbol];
    const token = tokens.find((t) => t.chainId === FUNDING_CHAIN &&
      (symbol === 'ETH' ? t.isNative : t.address.toLowerCase() === route.address.toLowerCase()));
    if (!token) continue;
    const price = symbol === 'USDC' ? 1 : Number(prices[symbol] ?? 0);
    const usd = Number(formatUnits(token.balance, route.decimals)) * price;
    const spendableUsd = symbol === 'USDC' ? Math.floor(usd * 100) / 100 : Math.floor(usd * MAX_SPEND_RESERVE * 100) / 100;
    assets.push({ symbol, address: route.address, decimals: route.decimals, balance: token.balance, usd, spendableUsd, feeTiers: route.feeTiers });
  }
  return assets.sort((a, b) => (a.symbol === 'USDC' ? -1 : b.symbol === 'USDC' ? 1 : b.usd - a.usd));
}

/** The asset a fresh ticket should spend: USDC when it covers the bill, otherwise the richest one. */
export function defaultFundingAsset(assets: FundingAsset[], usdAmount = 0): FundingAsset | null {
  const usdc = assets.find((a) => a.symbol === 'USDC');
  if (usdc && (usdAmount <= 0 ? usdc.balance > 0n : usdc.spendableUsd >= usdAmount)) return usdc;
  const richest = [...assets].filter((a) => a.balance > 0n).sort((a, b) => b.spendableUsd - a.spendableUsd)[0];
  return richest ?? usdc ?? assets[0] ?? null;
}

export interface FundingQuote {
  asset: FundingAsset;
  /** USDC the order deposits, in base units. */
  usdcAmount: bigint;
  /** Input the swap is expected to use, before slippage. Zero for USDC. */
  amountIn: bigint;
  /** Input ceiling handed to the router; the difference is refunded. Zero for USDC. */
  maxAmountIn: bigint;
  feeTier: number | null;
}

/**
 * Price the swap that lands exactly `usdcAmount` USDC from `asset`. Every fee
 * tier is quoted at once and the cheapest wins; a tier without a pool reverts
 * in eth_call and simply drops out.
 */
export async function quoteFunding(asset: FundingAsset, usdcAmount: bigint): Promise<FundingQuote> {
  if (usdcAmount <= 0n) throw new Error('Enter an amount to spend');
  if (asset.symbol === 'USDC') {
    if (asset.balance < usdcAmount) throw new Error('Insufficient USDC on Base');
    return { asset, usdcAmount, amountIn: 0n, maxAmountIn: 0n, feeTier: null };
  }
  const tokenIn = asset.symbol === 'ETH' ? WETH : asset.address;
  const quotes = await Promise.all(asset.feeTiers.map(async (fee) => {
    try {
      const amountIn = await readContract<bigint>(QUOTER_V2, quoter, 'quoteExactOutputSingle',
        [{ tokenIn, tokenOut: USDC, amount: usdcAmount, fee, sqrtPriceLimitX96: 0n }], FUNDING_CHAIN);
      return amountIn > 0n ? { amountIn, fee } : null;
    } catch { return null; }
  }));
  const best = quotes.filter((q): q is { amountIn: bigint; fee: number } => q !== null).sort((a, b) => (a.amountIn < b.amountIn ? -1 : 1))[0];
  if (!best) throw new Error(`No ${asset.symbol} → USDC route is available on Base right now`);
  const maxAmountIn = best.amountIn + best.amountIn * SLIPPAGE_BPS / 10000n;
  if (maxAmountIn > asset.balance) throw new Error(`Not enough ${asset.symbol} on Base to cover this order after slippage`);
  return { asset, usdcAmount, amountIn: best.amountIn, maxAmountIn, feeTier: best.fee };
}

/** The router call that buys exactly the USDC the order needs, refunding unused ETH in the same transaction. */
function swapCall(quote: FundingQuote, recipient: string): { to: string; data: `0x${string}`; value: bigint } {
  const native = quote.asset.symbol === 'ETH';
  const swap = router.encodeFunctionData('exactOutputSingle', [{
    tokenIn: native ? WETH : quote.asset.address, tokenOut: USDC, fee: quote.feeTier,
    recipient, amountOut: quote.usdcAmount, amountInMaximum: quote.maxAmountIn, sqrtPriceLimitX96: 0n,
  }]);
  const calls = native ? [swap, router.encodeFunctionData('refundETH', [])] : [swap];
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  return { to: SWAP_ROUTER, data: router.encodeFunctionData('multicall', [deadline, calls]) as `0x${string}`, value: native ? quote.maxAmountIn : 0n };
}

export type FundingStage = OrderStage | 'swap' | 'swapConfirm';
export interface FundedOrder {
  input: SellInput;
  quote: FundingQuote;
}
/** Progress a resumable external-wallet flow has already made. */
export interface FundingProgress {
  swapTxHash?: string;
}

/**
 * Swap, approve and mint in one sponsored user operation. Only the built-in
 * wallet can do this; anything else throws BATCH_UNSUPPORTED and the caller
 * falls back to the sequential path.
 */
async function fundAndMintBatched(order: FundedOrder, progress: (stage: FundingStage) => void): Promise<{ tokenId: string; txHash: string }> {
  const { input, quote } = order;
  const cfg = DEX_CHAINS[FUNDING_CHAIN];
  progress('quote');
  const position = await quoteSellPosition(input);
  if (position.amountIn > quote.usdcAmount) throw new Error('The position would require more USDC than the swap delivers');
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const calls: { to: string; data: `0x${string}`; value?: bigint }[] = [];
  if (quote.asset.symbol !== 'USDC') {
    if (quote.asset.symbol !== 'ETH') {
      calls.push({ to: quote.asset.address, data: erc20.encodeFunctionData('approve', [SWAP_ROUTER, quote.maxAmountIn]) as `0x${string}` });
    }
    calls.push(swapCall(quote, input.walletAddress));
  }
  // Approvals ride along unconditionally: they are cheap inside the batch and
  // the balance they cover only exists after the swap call before them.
  calls.push({ to: USDC, data: erc20.encodeFunctionData('approve', [PERMIT2, position.amountIn]) as `0x${string}` });
  calls.push({ to: PERMIT2, data: permit2.encodeFunctionData('approve', [USDC, cfg.positionManager, position.amountIn, expires]) as `0x${string}` });
  const parsed = positionManager.parseTransaction({ data: position.calldata });
  if (!parsed) throw new Error('Could not prepare the Uniswap position transaction');
  calls.push({ to: cfg.positionManager, data: position.calldata as `0x${string}`, value: BigInt(position.value) });
  progress('submit');
  const tx = await writeBatchAA(calls, { chainId: FUNDING_CHAIN, context: 'fund and create DHB buy order' });
  progress('confirm');
  return recoverMint(input, tx.hash);
}

/**
 * The same sequence as separate signed transactions. The swap's hash is
 * reported through `swapped` before the mint begins, so the caller can persist
 * it and hand it back as `resume` if the page reloads mid-flow.
 */
async function fundAndMintSequential(order: FundedOrder, progress: (stage: FundingStage) => void,
  swapped: (hash: string) => void, submitted: (hash: string) => void, resume?: FundingProgress): Promise<{ tokenId: string; txHash: string }> {
  const { input, quote } = order;
  if (quote.asset.symbol !== 'USDC' && !resume?.swapTxHash) {
    progress('wallet');
    await getActiveProvider(FUNDING_CHAIN);
    if (quote.asset.symbol !== 'ETH') {
      const allowance = await readContract<bigint>(quote.asset.address, erc20, 'allowance', [input.walletAddress, SWAP_ROUTER], FUNDING_CHAIN);
      if (allowance < quote.maxAmountIn) {
        progress('tokenApproval');
        const approval = await writeContractAA(quote.asset.address, erc20, 'approve', [SWAP_ROUTER, quote.maxAmountIn],
          { chainId: FUNDING_CHAIN, context: `approve ${quote.asset.symbol} for the swap` });
        if ((await readWithTimeout(approval.wait(), 'Approval confirmation', 120000)).status !== 1) throw new Error(`${quote.asset.symbol} approval did not confirm`);
      }
    }
    progress('swap');
    const call = swapCall(quote, input.walletAddress);
    const parsed = router.parseTransaction({ data: call.data });
    if (!parsed) throw new Error('Could not prepare the swap');
    const tx = await writeContractAA(SWAP_ROUTER, router, parsed.name, Array.from(parsed.args),
      { chainId: FUNDING_CHAIN, value: call.value, context: `swap ${quote.asset.symbol} for USDC` });
    swapped(tx.hash);
    progress('swapConfirm');
    const receipt = await readWithTimeout(tx.wait(), 'Swap confirmation; use Resume to continue once it lands', 180000);
    if (receipt.status !== 1) throw Object.assign(new Error('The swap reverted. Nothing was spent.'), { code: 'DEX_REVERTED' });
  }
  if (quote.asset.symbol !== 'USDC') {
    // A confirmed swap is not yet a visible balance on a load-balanced RPC.
    const balance = await waitForERC20Balance(USDC, input.walletAddress, quote.usdcAmount, FUNDING_CHAIN, 10, 1500);
    if (balance < quote.usdcAmount) throw new Error('The swap confirmed but the USDC has not shown up yet. Use Resume in a moment.');
  }
  return mintSellPosition(input, progress, submitted);
}

/**
 * Fund the order from `quote.asset` and mint it. Picks the atomic batch for the
 * built-in wallet and falls back to signed steps for everything else.
 */
export async function fundAndMint(order: FundedOrder, handlers: {
  progress?: (stage: FundingStage) => void;
  swapped?: (hash: string) => void;
  submitted?: (hash: string) => void;
  resume?: FundingProgress;
} = {}): Promise<{ tokenId: string; txHash: string }> {
  const progress = handlers.progress ?? (() => {});
  if (isSmartWalletSession() && !handlers.resume?.swapTxHash) {
    try {
      return await fundAndMintBatched(order, progress);
    } catch (error) {
      if ((error as Error).message !== 'BATCH_UNSUPPORTED') throw error;
    }
  }
  return fundAndMintSequential(order, progress, handlers.swapped ?? (() => {}), handlers.submitted ?? (() => {}), handlers.resume);
}

/** Whole-dollar USDC amount for a ticket, as the order input string and base units. */
export function usdcAmountFor(usd: string): { amount: string; units: bigint } | null {
  if (!/^\d+(\.\d{1,6})?$/.test(usd)) return null;
  const units = parseUnits(usd, 6);
  return units > 0n ? { amount: usd, units } : null;
}
