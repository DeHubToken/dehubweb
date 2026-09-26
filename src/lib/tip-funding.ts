/**
 * Paying for anything in DHB with whatever the payer holds, on whichever
 * chain it is. Used by tips, live gifts, pay-per-view and subscriptions.
 *
 * Every payment still settles in DHB on Base through the usual contracts, so
 * crediting is unchanged. What changes is where the DHB comes from, in this
 * order:
 *
 *   1. DeHub Pay. If DPay accepts the token directly (ETH/USDC/USDT on Base,
 *      Ethereum, BNB, Polygon, Robinhood…), it is paid to the DPay treasury
 *      and DPay sends the DHB from its own stock. The money stays with DeHub.
 *   2. deBridge → DeHub Pay. Anything DPay does not take (USDC on Arc, other
 *      tokens) is turned into an exact amount of USDC on Base by a deBridge
 *      order paid to the payer's own address, and that USDC pays DPay.
 *   3. Uniswap, as the fallback. When DPay is out of DHB, cannot deliver, or
 *      the payer is not signed in to it, the Base USDC (or the Base token)
 *      buys DHB from the Uniswap v4 DHB/USDC pool instead.
 *
 * Only the shortfall is bought: DHB already on Base is spent first.
 *
 * Every hop pays the payer's own address, so an interrupted flow leaves USDC
 * or DHB in their wallet, never in limbo — and the next attempt spends it as
 * Base balance.
 */
import { Interface, formatUnits, parseUnits } from 'ethers';
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
  type AABatchCall,
} from '@/lib/contracts/aa-utils';
import { isSmartWalletSession } from '@/lib/connection-source';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, CHAIN_CONFIGS, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import { ARC_CHAIN_ID } from '@/lib/chains/arc';
import { quoteSwap, runSwap, type SwapCall } from '@/lib/dex/evm-swap';
import { readWithTimeout } from '@/lib/dex/read-timeout';
import { cryptoPurchaseApi } from '@/lib/api/crypto-purchase';
import type { Purchase } from '@/lib/crypto-purchase';
import type { ChainId } from '@/components/app/ChainSelector';

const DLN_API = 'https://dln.debridge.finance/v1.0';
const DPAY_API = 'https://api.dehub.io/api/dpay';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DHB_BASE = CHAIN_CONFIGS[BASE_CHAIN_ID].dhbToken;
const ZERO = '0x0000000000000000000000000000000000000000';
/** Kyber source ids for the Uniswap pools, v4 first — that is where the DHB/USDC LP lives. */
const UNISWAP_SOURCES = 'uniswap-v4,uniswapv3,uniswap';

/** Chains a payment can be funded from: every EVM chain the wallet shows that deBridge also serves. */
export const TIP_FUNDING_CHAINS: number[] = [BASE_CHAIN_ID, ARC_CHAIN_ID, ETH_CHAIN_ID, BNB_CHAIN_ID, ROBINHOOD_CHAIN_ID];

/** DHB bought over the shortfall so slippage never leaves the payment short. 1%. */
const DHB_BUFFER_BPS = 100n;
/** USDC bridged over the quote, for the price moving while the order fills. 1.5%. */
const USDC_BUFFER_BPS = 150n;
/** DPay holds back 0.5% of a sale and sends it as gas, so ask for a touch more DHB. */
const DPAY_DELIVERED_SHARE = 0.995;
/** DPay's smallest sale is $0.50 (500 DHB at the peg). A smaller gap is rounded
 *  up to it — the spare DHB stays in the wallet — rather than skipping DPay. */
const DPAY_MIN_TOKENS = 501;
/** Native kept back where the Safe pays its own gas in the native coin (Arc: USDC). */
const NATIVE_GAS_RESERVE: Record<number, bigint> = { [ARC_CHAIN_ID]: 10n ** 17n };
const FILL_TIMEOUT_MS = 15 * 60_000;
const DPAY_DELIVERY_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 2_000;

export interface TipFundingSource {
  chainId: number;
  /** '0x0' for the chain's native coin. */
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  isNative?: boolean;
}

export type TipFundingStage = 'quote' | 'approve' | 'bridge' | 'arriving' | 'pay' | 'delivering' | 'swap';

interface DlnOrder {
  orderId: string;
  to: string;
  data: `0x${string}`;
  value: bigint;
  allowanceTarget?: string;
  amountIn: bigint;
  usdcOut: bigint;
  fillSeconds: number;
}

interface DpayQuote {
  originAsset: string;
  tokensToReceive: number;
  amountIn: bigint;
  paymentDecimals: number;
}

export type TipFundingPlan =
  | { kind: 'none' }
  | { kind: 'dpay'; source: TipFundingSource; dpay: DpayQuote; payAmount: bigint }
  | { kind: 'swap'; source: TipFundingSource; swap: SwapCall; payAmount: bigint }
  | { kind: 'bridge'; source: TipFundingSource; order: DlnOrder; payAmount: bigint; fillSeconds: number; via: 'dpay' | 'uniswap' };

const erc20 = new Interface([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'function deposit() payable',
]);
const isNativeSource = (s: { address: string; isNative?: boolean }) => s.isNative || s.address === '0x0' || s.address.toLowerCase() === ZERO;
const withBps = (x: bigint, bps: bigint) => x + (x * bps) / 10000n + 1n;
const toDhbWei = (dhb: number) => BigInt(Math.ceil(dhb * 1e6)) * 10n ** 12n;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Uniswap (fallback) ─────────────────────────────────────────────── */

async function quoteUniswap(tokenIn: string, amountIn: bigint, recipient: string): Promise<SwapCall> {
  const input = { chainId: BASE_CHAIN_ID, tokenIn, tokenOut: DHB_BASE, amountIn, recipient };
  try {
    return await quoteSwap({ ...input, sources: UNISWAP_SOURCES });
  } catch {
    return quoteSwap(input);
  }
}

/** Kyber quotes exact input only: probe the rate, size the input, correct for price impact. */
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
  throw new Error('There is not enough Uniswap liquidity for a payment this size right now');
}

/* ── DeHub Pay ──────────────────────────────────────────────────────── */

/** DPay's asset id for a token it accepts straight into its treasury, or null. */
function dpayAssetId(source: { chainId: number; address: string; isNative?: boolean }): string | null {
  const accepted: Record<number, string[]> = {
    [BASE_CHAIN_ID]: ['native', USDC_BASE, '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'],
    [ETH_CHAIN_ID]: ['native', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    [BNB_CHAIN_ID]: ['native', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', '0x55d398326f99059fF775485246999027B3197955'],
    [ROBINHOOD_CHAIN_ID]: ['native', '0x80E0e24718DBFcaD49eCaa6f1e6C89A190586cA8', '0xe246bc49b0598d7cd9f0ead48b885034f1254380'],
  };
  const list = accepted[source.chainId];
  if (!list) return null;
  // DPay ids the gas coin as `native` on Base/Ethereum/BNB, but as the zero
  // address on Robinhood, where it comes from the token list instead.
  if (isNativeSource(source)) return source.chainId === ROBINHOOD_CHAIN_ID ? `direct:${source.chainId}:${ZERO}` : `direct:${source.chainId}:native`;
  const hit = list.find(a => a.toLowerCase() === source.address.toLowerCase());
  return hit ? `direct:${source.chainId}:${hit.toLowerCase()}` : null;
}

/** Whole DHB to ask DPay for so that, after its gas hold-back, at least `shortfall` arrives. */
const dpayTokensFor = (shortfallWei: bigint) =>
  Math.max(DPAY_MIN_TOKENS, Math.ceil(Number(formatUnits(shortfallWei, 18)) / DPAY_DELIVERED_SHARE) + 1);

async function dpayStock(): Promise<number> {
  const res = await readWithTimeout(fetch(`${DPAY_API}/available/tokens`), 'DeHub Pay stock', 10000);
  const json = await res.json().catch(() => null) as { balance?: Record<string, { DHB?: number }> } | null;
  return Number(json?.balance?.[BASE_CHAIN_ID]?.DHB ?? 0);
}

/** Price `tokensToReceive` DHB from DPay, paid in `originAsset`. Null when DPay cannot sell it right now. */
async function quoteDpay(originAsset: string, tokensToReceive: number, decimals: number, wallet: string): Promise<DpayQuote | null> {
  try {
    const [stock, quote] = await Promise.all([
      dpayStock(),
      cryptoPurchaseApi.quote({ originAsset, tokensToReceive, address: wallet }) as Promise<{ amountIn?: string; paymentDecimals?: number; estimatedTokensToReceive?: number }>,
    ]);
    if (stock < tokensToReceive || !quote.amountIn) return null;
    // A DPay asset whose decimals disagree with the chain's would price the
    // payment off by orders of magnitude. Skip it rather than trust it.
    if (quote.paymentDecimals != null && quote.paymentDecimals !== decimals) return null;
    return { originAsset, tokensToReceive, amountIn: BigInt(quote.amountIn), paymentDecimals: decimals };
  } catch {
    return null;
  }
}

/** The calls that pay a DPay purchase from the payer's wallet, exactly as DPay asked. */
function dpayPaymentCalls(p: Purchase): AABatchCall[] {
  if (p.paymentDecimals == null) throw new Error('DeHub Pay did not return a payment amount');
  const amount = parseUnits(p.amountInFormatted, p.paymentDecimals);
  if (p.wrapNativePayment && p.paymentTokenAddress) {
    return [
      { to: p.paymentTokenAddress, data: erc20.encodeFunctionData('deposit') as `0x${string}`, value: amount },
      { to: p.paymentTokenAddress, data: erc20.encodeFunctionData('transfer', [p.depositAddress, amount]) as `0x${string}` },
    ];
  }
  return p.paymentTokenAddress
    ? [{ to: p.paymentTokenAddress, data: erc20.encodeFunctionData('transfer', [p.depositAddress, amount]) as `0x${string}` }]
    : [{ to: p.depositAddress, data: '0x', value: amount }];
}

/**
 * Buy DHB from DPay with `source`: open the purchase, pay the treasury, hand
 * DPay the hash, and wait until the DHB is in the wallet. Throws DPAY_UNAVAILABLE
 * before any money moves when DPay cannot take the order, so the caller can
 * fall back to Uniswap.
 */
async function buyFromDpay(originAsset: string, tokensToReceive: number, chainId: number, wallet: string, needed: bigint, stage: (s: TipFundingStage) => void): Promise<void> {
  let purchase: Purchase;
  try {
    purchase = await cryptoPurchaseApi.create({
      originAsset, tokensToReceive, refundTo: wallet, receiverAddress: wallet,
      termsAndServicesAccepted: true, requestId: `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
  } catch {
    throw new Error('DPAY_UNAVAILABLE');
  }
  if (purchase.paymentChainId !== chainId || purchase.refundTo?.toLowerCase() !== wallet.toLowerCase()) throw new Error('DPAY_UNAVAILABLE');

  stage('pay');
  const txHash = await sendOnChain(chainId, dpayPaymentCalls(purchase), 'DeHub Pay payment', stage, 'pay');

  // From here the treasury has the money; failures are delays, never refunds to chase.
  stage('delivering');
  const started = Date.now();
  let status: Purchase | null = await cryptoPurchaseApi.confirm(purchase.id, txHash).catch(() => null);
  while (status?.tokenSendStatus !== 'sent' && Date.now() - started < DPAY_DELIVERY_TIMEOUT_MS) {
    await sleep(POLL_MS * 2);
    status = await cryptoPurchaseApi.status(purchase.id).catch(() => status);
  }
  const dhb = await waitForERC20Balance(DHB_BASE, wallet, needed, BASE_CHAIN_ID, 10, 1500);
  if (dhb < needed) {
    throw new Error('DeHub Pay has your payment and is sending the DHB. It will arrive in your wallet shortly; send again once it does.');
  }
}

/* ── deBridge ───────────────────────────────────────────────────────── */

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

async function waitForFill(orderId: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < FILL_TIMEOUT_MS) {
    const status = await dln<{ status?: string }>(`/dln/order/${orderId}/status`).then(r => r.status).catch(() => undefined);
    if (status === 'Fulfilled' || status === 'SentUnlock' || status === 'ClaimedUnlock') return;
    if (status && /cancel/i.test(status)) throw new Error('The cross-chain order was cancelled and refunded to your wallet');
    await sleep(POLL_MS);
  }
  throw new Error('The cross-chain transfer is taking longer than usual. It will arrive in your wallet on Base; send again once it does.');
}

/* ── Wallet plumbing ────────────────────────────────────────────────── */

async function nativeBalance(wallet: string, chainId: number): Promise<bigint> {
  return BigInt(await rpcRequest<string>('eth_getBalance', [wallet, 'latest'], chainId as ChainId));
}

/** Calls on one chain, through whichever wallet is signed in. Returns the last hash. */
async function sendOnChain(chainId: number, calls: AABatchCall[], context: string, stage: (s: TipFundingStage) => void, sendStage: TipFundingStage): Promise<string> {
  if (isSmartWalletSession()) {
    stage(sendStage);
    try {
      return (await writeBatchAA(calls, { chainId, context, sponsored: false })).hash;
    } catch (error) {
      if (!isSelfFundedGasInsufficientError(error)) throw error;
      return (await writeBatchAA(calls, { chainId, context })).hash;
    }
  }
  await switchChain(chainId as ChainId);
  let hash = '';
  for (const [i, call] of calls.entries()) {
    stage(i < calls.length - 1 && calls.length > 1 ? 'approve' : sendStage);
    hash = await sendTransaction(wagmiConfig, { to: call.to as `0x${string}`, data: call.data, value: call.value ?? 0n, chainId: chainId as never });
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: hash as `0x${string}`, chainId: chainId as never });
    if (receipt.status !== 'success') throw new Error(`${context} did not confirm. Nothing was spent.`);
  }
  return hash;
}

/* ── Planning ───────────────────────────────────────────────────────── */

/**
 * Price a payment of `amountDhb` from `source`. `dhbOnBase` is what the
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
  const shortfall = needed - input.dhbOnBase;
  const reserve = NATIVE_GAS_RESERVE[source.chainId] ?? 0n;

  // 1. Straight to DeHub Pay.
  const assetId = dpayAssetId(source);
  if (assetId) {
    const dpay = await quoteDpay(assetId, dpayTokensFor(shortfall), source.decimals, walletAddress);
    if (dpay && dpay.amountIn + (isNativeSource(source) ? reserve : 0n) <= source.balance) {
      return { kind: 'dpay', source, dpay, payAmount: dpay.amountIn };
    }
  }

  // 3a. A Base token DPay does not take goes through Uniswap directly.
  const dhbOut = withBps(shortfall, DHB_BUFFER_BPS);
  if (source.chainId === BASE_CHAIN_ID) {
    if (source.balance <= 0n) throw new Error(`No ${source.symbol} on Base`);
    const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, dhbOut, walletAddress);
    if (swap.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} on Base for this payment`);
    return { kind: 'swap', source, swap, payAmount: swap.amountIn };
  }

  // 2 / 3b. Bridge exactly the USDC that DPay (or failing that, Uniswap) needs.
  const dpayUsdc = await quoteDpay(`direct:${BASE_CHAIN_ID}:${USDC_BASE.toLowerCase()}`, dpayTokensFor(shortfall), 6, walletAddress);
  const usdcNeeded = dpayUsdc ? dpayUsdc.amountIn : (await sizeDhbBuy(USDC_BASE, 10_000_000n, dhbOut, walletAddress)).amountIn;
  const order = await createDlnOrder(source, withBps(usdcNeeded, USDC_BUFFER_BPS), walletAddress);
  if (isNativeSource(source)) {
    if (order.value + reserve > source.balance) throw new Error(`Not enough ${source.symbol} for this payment, including network fees`);
  } else {
    if (order.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} for this payment`);
    if (order.value + reserve > await nativeBalance(walletAddress, source.chainId)) {
      throw new Error('Not enough of the network coin to cover the cross-chain fee');
    }
  }
  return {
    kind: 'bridge', source, order, fillSeconds: order.fillSeconds, via: dpayUsdc ? 'dpay' : 'uniswap',
    payAmount: isNativeSource(source) ? order.value : order.amountIn,
  };
}

/* ── Running ────────────────────────────────────────────────────────── */

/** USDC already on Base → DHB: DPay first, Uniswap if DPay cannot take it. */
async function spendBaseUsdc(usdc: bigint, wallet: string, needed: bigint, dhbOnBase: bigint, stage: (s: TipFundingStage) => void): Promise<void> {
  const tokens = dpayTokensFor(needed - dhbOnBase);
  const dpay = await quoteDpay(`direct:${BASE_CHAIN_ID}:${USDC_BASE.toLowerCase()}`, tokens, 6, wallet);
  if (dpay && dpay.amountIn <= usdc) {
    try {
      return await buyFromDpay(dpay.originAsset, tokens, BASE_CHAIN_ID, wallet, needed, stage);
    } catch (error) {
      if ((error as Error).message !== 'DPAY_UNAVAILABLE') throw error;
    }
  }
  const swap = await quoteUniswap(USDC_BASE, usdc, wallet);
  if (dhbOnBase + swap.minAmountOut < needed) {
    throw new Error('DHB moved while your USDC was arriving. The USDC is in your wallet on Base; send again to finish.');
  }
  stage('swap');
  await runSwap(swap, wallet);
}

/**
 * Run a plan from `planTipFunding`, re-quoted fresh so a price shown a minute
 * ago is never the one executed. Resolves once the wallet holds `amountDhb`
 * DHB on Base; the caller then makes the payment as usual.
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
  let plan = await planTipFunding({ source, amountDhb: input.amountDhb, dhbOnBase, walletAddress: wallet });
  if (plan.kind === 'none') return;

  if (plan.kind === 'dpay') {
    try {
      await buyFromDpay(plan.dpay.originAsset, plan.dpay.tokensToReceive, source.chainId, wallet, needed, stage);
      return;
    } catch (error) {
      if ((error as Error).message !== 'DPAY_UNAVAILABLE') throw error;
      // DPay turned the order down before any money moved. Base tokens can
      // still buy on Uniswap; anything else re-plans through the bridge.
      if (source.chainId === BASE_CHAIN_ID) {
        const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, withBps(needed - dhbOnBase, DHB_BUFFER_BPS), wallet);
        stage('swap');
        await runSwap(swap, wallet);
        return;
      }
      const usdcSwap = await sizeDhbBuy(USDC_BASE, 10_000_000n, withBps(needed - dhbOnBase, DHB_BUFFER_BPS), wallet);
      const order = await createDlnOrder(source, withBps(usdcSwap.amountIn, USDC_BUFFER_BPS), wallet);
      plan = {
        kind: 'bridge', source, order, fillSeconds: order.fillSeconds, via: 'uniswap',
        payAmount: isNativeSource(source) ? order.value : order.amountIn,
      };
    }
  }

  if (plan.kind === 'swap') {
    stage('swap');
    await runSwap(plan.swap, wallet);
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
    await sendOnChain(source.chainId, calls, 'Cross-chain transfer', stage, 'bridge');

    stage('arriving');
    await waitForFill(order.orderId);
    const usdc = await waitForERC20Balance(USDC_BASE, wallet, usdcBefore + order.usdcOut, BASE_CHAIN_ID, 20, 1500);
    if (usdc < usdcBefore + order.usdcOut) {
      throw new Error('Your USDC arrived on Base but is not visible yet. Send again in a moment.');
    }
    await spendBaseUsdc(order.usdcOut, wallet, needed, dhbOnBase, stage);
  }

  const dhb = await waitForERC20Balance(DHB_BASE, wallet, needed, BASE_CHAIN_ID, 10, 1500);
  if (dhb < needed) throw new Error('The DHB purchase confirmed but has not shown up yet. Send again in a moment.');
}

/** Human amount for a plan's input, trimmed for a one-line summary. */
export function formatPayAmount(plan: TipFundingPlan): string | null {
  if (plan.kind === 'none') return null;
  const n = Number(formatUnits(plan.payAmount, plan.source.decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });
}

/** Whether a plan buys from DeHub Pay (true) or the Uniswap pool (false). */
export function planUsesDpay(plan: TipFundingPlan): boolean {
  return plan.kind === 'dpay' || (plan.kind === 'bridge' && plan.via === 'dpay');
}
