/**
 * Paying a DHB tip with whatever the tipper holds, on whichever chain it is.
 *
 * Tips settle in DHB on Base, through StreamController, so the creator is
 * credited exactly as before. What changes is where the DHB comes from:
 *
 *   1. Token on another chain (USDC on Arc, ETH on Ethereum, USDT on BNB…) →
 *      a deBridge order that delivers an EXACT amount of USDC to the tipper's
 *      own address on Base. Solvers fill from their own inventory, so the USDC
 *      lands in seconds; nobody bridges anything themselves.
 *   2. USDC (or any token already on Base) → DHB through the Uniswap v4
 *      DHB/USDC pool, via the same Kyber router the DEX page's instant buy
 *      uses, pinned to Uniswap sources.
 *   3. The caller then sends the tip exactly as a DHB holder would.
 *
 * Only the shortfall is bought: DHB already on Base is spent first. The swap
 * overbuys by a hair so slippage never leaves the tip one wei short; the rest
 * stays in the tipper's wallet.
 *
 * Nothing here is custodial. Every hop pays the tipper's own address, so an
 * interrupted flow leaves USDC or DHB in their wallet, never in limbo — and
 * the next attempt picks it up as Base balance.
 */
import { Interface, formatUnits } from 'ethers';
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import {
  getERC20Allowance,
  getERC20Balance,
  isSelfFundedGasInsufficientError,
  rpcRequest,
  switchChain,
  waitForERC20Balance,
  writeBatchAA,
  writeContractAA,
  type AABatchCall,
} from '@/lib/contracts/aa-utils';
import { isSmartWalletSession } from '@/lib/connection-source';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import { ARC_CHAIN_ID } from '@/lib/chains/arc';
import { quoteSwap, runSwap, type SwapCall } from '@/lib/dex/evm-swap';
import { readWithTimeout } from '@/lib/dex/read-timeout';
import type { ChainId } from '@/components/app/ChainSelector';

const DLN_API = 'https://dln.debridge.finance/v1.0';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DHB_BASE = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
const ZERO = '0x0000000000000000000000000000000000000000';
/** Kyber source ids for the Uniswap pools, v4 first — that is where the DHB/USDC LP lives. */
const UNISWAP_SOURCES = 'uniswap-v4,uniswapv3,uniswap';

/** Chains a tip can be paid from: every EVM chain the wallet shows that deBridge also serves. */
export const TIP_FUNDING_CHAINS: number[] = [BASE_CHAIN_ID, ARC_CHAIN_ID, ETH_CHAIN_ID, BNB_CHAIN_ID, ROBINHOOD_CHAIN_ID];

/** DHB bought over the shortfall so slippage never leaves the tip short. 1%. */
const DHB_BUFFER_BPS = 100n;
/** USDC bridged over the swap quote, for the price moving while the order fills. 1.5%. */
const USDC_BUFFER_BPS = 150n;
/** Native kept back where the Safe pays its own gas in the native coin (Arc: USDC). */
const NATIVE_GAS_RESERVE: Record<number, bigint> = { [ARC_CHAIN_ID]: 10n ** 17n };
const FILL_TIMEOUT_MS = 15 * 60_000;
const FILL_POLL_MS = 2_000;

export interface TipFundingSource {
  chainId: number;
  /** '0x0' for the chain's native coin. */
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  isNative?: boolean;
}

export type TipFundingStage = 'quote' | 'approve' | 'bridge' | 'arriving' | 'swap';

interface DlnOrder {
  orderId: string;
  to: string;
  data: `0x${string}`;
  value: bigint;
  allowanceTarget?: string;
  /** Source token the order spends, before `value`'s native fee. */
  amountIn: bigint;
  usdcOut: bigint;
  fillSeconds: number;
}

export type TipFundingPlan =
  | { kind: 'none' }
  | { kind: 'swap'; source: TipFundingSource; swap: SwapCall; payAmount: bigint }
  | { kind: 'bridge'; source: TipFundingSource; order: DlnOrder; payAmount: bigint; fillSeconds: number };

const erc20 = new Interface(['function approve(address spender,uint256 amount) returns (bool)']);
const isNativeSource = (s: TipFundingSource) => s.isNative || s.address === '0x0' || s.address.toLowerCase() === ZERO;
const withBps = (x: bigint, bps: bigint) => x + (x * bps) / 10000n + 1n;
const toDhbWei = (dhb: number) => BigInt(Math.ceil(dhb * 1e6)) * 10n ** 12n;

async function quoteUniswap(tokenIn: string, amountIn: bigint, recipient: string): Promise<SwapCall> {
  const input = { chainId: BASE_CHAIN_ID, tokenIn, tokenOut: DHB_BASE, amountIn, recipient };
  try {
    return await quoteSwap({ ...input, sources: UNISWAP_SOURCES });
  } catch {
    // A token with no Uniswap leg (rare on Base) still routes through Kyber's
    // other pools into the same DHB/USDC pool.
    return quoteSwap(input);
  }
}

/**
 * The Base swap that delivers at least `dhbOut` after slippage. Kyber only
 * quotes exact input, so this probes the rate, sizes the input, and corrects
 * for price impact until the guaranteed output clears the target.
 */
async function sizeDhbBuy(tokenIn: string, probeIn: bigint, dhbOut: bigint, recipient: string): Promise<SwapCall> {
  const probe = await quoteUniswap(tokenIn, probeIn, recipient);
  if (probe.minAmountOut <= 0n) throw new Error('No Uniswap route to DHB for this token right now');
  let amountIn = withBps((probeIn * dhbOut) / probe.minAmountOut, 30n);
  for (let attempt = 0; attempt < 4; attempt++) {
    const swap = await quoteUniswap(tokenIn, amountIn, recipient);
    if (swap.minAmountOut >= dhbOut) return swap;
    if (swap.minAmountOut <= 0n) break;
    amountIn = withBps((amountIn * dhbOut) / swap.minAmountOut, 30n);
  }
  throw new Error('There is not enough Uniswap liquidity for a tip this size right now');
}

async function dln<T>(path: string): Promise<T> {
  const res = await readWithTimeout(fetch(`${DLN_API}${path}`), 'Cross-chain quote', 20000);
  const json = await res.json().catch(() => null) as (T & { errorMessage?: string }) | null;
  if (!res.ok || !json || json.errorMessage) throw new Error(json?.errorMessage || 'No cross-chain route is available right now');
  return json;
}

async function createDlnOrder(source: TipFundingSource, usdcOut: bigint, wallet: string): Promise<DlnOrder> {
  const params = new URLSearchParams({
    srcChainId: String(source.chainId),
    srcChainTokenIn: isNativeSource(source) ? ZERO : source.address,
    srcChainTokenInAmount: 'auto',
    dstChainId: String(BASE_CHAIN_ID),
    dstChainTokenOut: USDC_BASE,
    dstChainTokenOutAmount: usdcOut.toString(),
    dstChainTokenOutRecipient: wallet,
    srcChainOrderAuthorityAddress: wallet,
    dstChainOrderAuthorityAddress: wallet,
    senderAddress: wallet,
    prependOperatingExpenses: 'true',
  });
  const res = await dln<{
    orderId: string;
    estimation: { srcChainTokenIn: { amount: string }; dstChainTokenOut: { amount: string } };
    tx: { to?: string; data?: string; value?: string; allowanceTarget?: string };
    order?: { approximateFulfillmentDelay?: number };
  }>(`/dln/order/create-tx?${params}`);
  if (!res.tx?.to || !res.tx.data) throw new Error('No cross-chain route is available right now');
  return {
    orderId: res.orderId,
    to: res.tx.to,
    data: res.tx.data as `0x${string}`,
    value: BigInt(res.tx.value || '0'),
    allowanceTarget: res.tx.allowanceTarget,
    amountIn: BigInt(res.estimation.srcChainTokenIn.amount),
    usdcOut: BigInt(res.estimation.dstChainTokenOut.amount),
    fillSeconds: res.order?.approximateFulfillmentDelay ?? 10,
  };
}

async function nativeBalance(wallet: string, chainId: number): Promise<bigint> {
  return BigInt(await rpcRequest<string>('eth_getBalance', [wallet, 'latest'], chainId as ChainId));
}

/**
 * Price a tip of `amountDhb` paid from `source`. `dhbOnBase` is what the
 * wallet already holds on Base; only the gap is bought.
 */
export async function planTipFunding(input: {
  source: TipFundingSource;
  amountDhb: number;
  dhbOnBase: bigint;
  walletAddress: string;
}): Promise<TipFundingPlan> {
  const { source, walletAddress } = input;
  const needed = toDhbWei(input.amountDhb);
  if (input.dhbOnBase >= needed) return { kind: 'none' };
  const dhbOut = withBps(needed - input.dhbOnBase, DHB_BUFFER_BPS);

  if (source.chainId === BASE_CHAIN_ID) {
    if (source.balance <= 0n) throw new Error(`No ${source.symbol} on Base`);
    const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, dhbOut, walletAddress);
    if (swap.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} on Base for this tip`);
    return { kind: 'swap', source, swap, payAmount: swap.amountIn };
  }

  // Size the USDC first, then ask deBridge for exactly that much on Base.
  const usdcSwap = await sizeDhbBuy(USDC_BASE, 10_000_000n, dhbOut, walletAddress);
  const order = await createDlnOrder(source, withBps(usdcSwap.amountIn, USDC_BUFFER_BPS), walletAddress);
  const reserve = NATIVE_GAS_RESERVE[source.chainId] ?? 0n;
  const symbol = source.symbol;
  if (isNativeSource(source)) {
    if (order.value + reserve > source.balance) throw new Error(`Not enough ${symbol} for this tip, including network fees`);
  } else {
    if (order.amountIn > source.balance) throw new Error(`Not enough ${symbol} for this tip`);
    if (order.value + reserve > await nativeBalance(walletAddress, source.chainId)) {
      throw new Error('Not enough of the network coin to cover the cross-chain fee');
    }
  }
  return { kind: 'bridge', source, order, payAmount: isNativeSource(source) ? order.value : order.amountIn, fillSeconds: order.fillSeconds };
}

/** One transaction on the source chain, through whichever wallet is signed in. */
async function sendOnSource(chainId: number, calls: AABatchCall[], stage: (s: TipFundingStage) => void): Promise<string> {
  if (isSmartWalletSession()) {
    stage('bridge');
    try {
      return (await writeBatchAA(calls, { chainId, context: 'cross-chain tip', sponsored: false })).hash;
    } catch (error) {
      if (!isSelfFundedGasInsufficientError(error)) throw error;
      return (await writeBatchAA(calls, { chainId, context: 'cross-chain tip' })).hash;
    }
  }
  await switchChain(chainId as ChainId);
  const order = calls[calls.length - 1];
  if (calls.length > 1) {
    stage('approve');
    const [spender, amount] = erc20.decodeFunctionData('approve', calls[0].data);
    const tx = await writeContractAA(calls[0].to, erc20, 'approve', [spender, amount], { chainId, context: 'approve cross-chain tip' });
    if ((await tx.wait(1)).status !== 1) throw new Error('The approval did not confirm');
  }
  stage('bridge');
  const hash = await sendTransaction(wagmiConfig, { to: order.to as `0x${string}`, data: order.data, value: order.value ?? 0n, chainId: chainId as never });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: chainId as never });
  if (receipt.status !== 'success') throw new Error('The cross-chain transfer did not confirm. Nothing was spent.');
  return hash;
}

async function waitForFill(orderId: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < FILL_TIMEOUT_MS) {
    const status = await dln<{ status?: string }>(`/dln/order/${orderId}/status`).then(r => r.status).catch(() => undefined);
    if (status === 'Fulfilled' || status === 'SentUnlock' || status === 'ClaimedUnlock') return;
    if (status && /cancel/i.test(status)) throw new Error('The cross-chain order was cancelled and refunded to your wallet');
    await new Promise(r => setTimeout(r, FILL_POLL_MS));
  }
  throw new Error('The cross-chain transfer is taking longer than usual. It will arrive in your wallet on Base; send the tip again once it does.');
}

/**
 * Run a plan from `planTipFunding`, re-quoted fresh so a price shown a minute
 * ago is never the one executed. Resolves once the wallet holds the DHB on
 * Base; the caller sends the tip.
 */
export async function fundTip(input: {
  source: TipFundingSource;
  amountDhb: number;
  walletAddress: string;
  onStage?: (stage: TipFundingStage) => void;
}): Promise<void> {
  const { source, walletAddress: wallet } = input;
  const stage = input.onStage ?? (() => {});
  stage('quote');
  const needed = toDhbWei(input.amountDhb);
  const dhbOnBase = await getERC20Balance(DHB_BASE, wallet, BASE_CHAIN_ID);
  const plan = await planTipFunding({ source, amountDhb: input.amountDhb, dhbOnBase, walletAddress: wallet });
  if (plan.kind === 'none') return;

  let swap: SwapCall;
  if (plan.kind === 'swap') {
    swap = plan.swap;
  } else {
    const { order } = plan;
    const calls: AABatchCall[] = [];
    if (!isNativeSource(source) && order.allowanceTarget) {
      const allowance = await getERC20Allowance(source.address, wallet, order.allowanceTarget, source.chainId as ChainId);
      if (allowance < order.amountIn) {
        calls.push({ to: source.address, data: erc20.encodeFunctionData('approve', [order.allowanceTarget, order.amountIn]) as `0x${string}` });
      }
    }
    calls.push({ to: order.to, data: order.data, value: order.value });
    const usdcBefore = await getERC20Balance(USDC_BASE, wallet, BASE_CHAIN_ID);
    await sendOnSource(source.chainId, calls, stage);

    stage('arriving');
    await waitForFill(order.orderId);
    const usdc = await waitForERC20Balance(USDC_BASE, wallet, usdcBefore + order.usdcOut, BASE_CHAIN_ID, 20, 1500);
    if (usdc < usdcBefore + order.usdcOut) {
      throw new Error('Your USDC arrived on Base but is not visible yet. Send the tip again in a moment.');
    }
    // Everything the order delivered goes into DHB; any surplus DHB stays in the wallet.
    swap = await quoteUniswap(USDC_BASE, order.usdcOut, wallet);
    if (dhbOnBase + swap.minAmountOut < needed) {
      throw new Error('DHB moved while your USDC was arriving. The USDC is in your wallet on Base; send the tip again to finish.');
    }
  }

  stage('swap');
  await runSwap(swap, wallet);
  const dhb = await waitForERC20Balance(DHB_BASE, wallet, needed, BASE_CHAIN_ID, 10, 1500);
  if (dhb < needed) throw new Error('The DHB purchase confirmed but has not shown up yet. Send the tip again in a moment.');
}

/** Human amount for a plan's input, trimmed for a one-line summary. */
export function formatPayAmount(plan: TipFundingPlan): string | null {
  if (plan.kind === 'none') return null;
  const n = Number(formatUnits(plan.payAmount, plan.source.decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });
}
