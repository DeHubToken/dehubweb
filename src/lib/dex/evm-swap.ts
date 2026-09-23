/**
 * Instant (market) swaps on EVM chains, routed by the KyberSwap aggregator.
 *
 * Kyber quotes every DEX on Base, Ethereum and Robinhood Chain in one call and
 * hands back ready calldata for its router, which is what an "instant buy"
 * needs: best price now, one transaction, no book to wait on. It is keyless
 * and CORS-open, so the browser talks to it directly.
 *
 * The built-in wallet is a Safe, so approve + swap (+ any follow-up call, such
 * as the pool listing fee transfer) run as ONE sponsored user operation.
 * External wallets sign the approval and the swap separately.
 */
import { Interface, type BigNumberish } from 'ethers';
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { getERC20Allowance, writeBatchAA, writeContractAA, type AABatchCall } from '@/lib/contracts/aa-utils';
import { isSmartWalletSession } from '@/lib/connection-source';
import { BASE_CHAIN_ID, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import { readWithTimeout } from './read-timeout';

/** Kyber's placeholder for the chain's native coin (ETH on all three chains here). */
export const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const KYBER = 'https://aggregator-api.kyberswap.com';
const CLIENT_ID = 'dehub';
const SLUGS: Record<number, string> = { [BASE_CHAIN_ID]: 'base', [ETH_CHAIN_ID]: 'ethereum', [ROBINHOOD_CHAIN_ID]: 'robinhood' };
const erc20 = new Interface(['function approve(address spender,uint256 amount) returns (bool)']);

export const isNative = (address: string) => address.toLowerCase() === NATIVE.toLowerCase() || address === '0x0' || /^0x0{40}$/.test(address);

export interface SwapCall {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  /** What the router guarantees after slippage. */
  minAmountOut: bigint;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  router: string;
  data: `0x${string}`;
  value: bigint;
}

async function kyber<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await readWithTimeout(fetch(url, { ...init, headers: { 'x-client-id': CLIENT_ID, ...(init?.body ? { 'content-type': 'application/json' } : {}) } }), 'Swap route', 15000);
  const json = await res.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!res.ok || !json || (json.code != null && json.code !== 0) || !json.data) {
    throw new Error(json?.message ? `No swap route: ${json.message}` : 'No swap route is available right now');
  }
  return json.data;
}

export async function quoteSwap(input: { chainId: number; tokenIn: string; tokenOut: string; amountIn: bigint; recipient: string; slippageBps?: number }): Promise<SwapCall> {
  const slug = SLUGS[input.chainId];
  if (!slug) throw new Error('Instant swaps are not available on this network');
  if (input.amountIn <= 0n) throw new Error('Enter an amount');
  const tokenIn = isNative(input.tokenIn) ? NATIVE : input.tokenIn;
  const tokenOut = isNative(input.tokenOut) ? NATIVE : input.tokenOut;
  const params = new URLSearchParams({ tokenIn, tokenOut, amountIn: input.amountIn.toString(), gasInclude: 'true' });
  const route = await kyber<{ routeSummary: Record<string, unknown> & { amountOut: string; amountInUsd?: string; amountOutUsd?: string }; routerAddress: string }>(
    `${KYBER}/${slug}/api/v1/routes?${params}`);
  const built = await kyber<{ data: string; routerAddress: string; transactionValue?: string; amountOut: string }>(
    `${KYBER}/${slug}/api/v1/route/build`, {
      method: 'POST',
      body: JSON.stringify({
        routeSummary: route.routeSummary, sender: input.recipient, recipient: input.recipient,
        slippageTolerance: input.slippageBps ?? 100, deadline: Math.floor(Date.now() / 1000) + 1200, source: CLIENT_ID,
      }),
    });
  const amountOut = BigInt(built.amountOut || route.routeSummary.amountOut);
  const slippage = BigInt(input.slippageBps ?? 100);
  return {
    chainId: input.chainId, tokenIn, tokenOut, amountIn: input.amountIn, amountOut,
    minAmountOut: amountOut - amountOut * slippage / 10000n,
    amountInUsd: Number(route.routeSummary.amountInUsd) || null,
    amountOutUsd: Number(route.routeSummary.amountOutUsd) || null,
    router: built.routerAddress || route.routerAddress,
    data: built.data as `0x${string}`,
    value: BigInt(built.transactionValue || (isNative(tokenIn) ? input.amountIn : 0n)),
  };
}

/** A contract write for a raw call, through whichever wallet is signed in. */
async function sendRaw(chainId: number, to: string, data: `0x${string}`, value: BigNumberish, context: string): Promise<string> {
  if (isSmartWalletSession()) {
    const tx = await writeBatchAA([{ to, data, value: BigInt(value) }], { chainId, context });
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw new Error(`${context} did not confirm`);
    return receipt.hash || tx.hash;
  }
  const hash = await sendTransaction(wagmiConfig, { to: to as `0x${string}`, data, value: BigInt(value), chainId: chainId as never });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: chainId as never });
  if (receipt.status !== 'success') throw new Error(`${context} did not confirm`);
  return hash;
}

/**
 * Run a quoted swap. `followUp` calls ride in the same user operation on the
 * built-in wallet; an external wallet sends them afterwards, and the last one's
 * hash comes back as `followUpHash`.
 */
export async function runSwap(swap: SwapCall, walletAddress: string, followUp: AABatchCall[] = []): Promise<{ hash: string; followUpHash?: string }> {
  const needsApproval = !isNative(swap.tokenIn) &&
    await getERC20Allowance(swap.tokenIn, walletAddress, swap.router, swap.chainId as never) < swap.amountIn;
  if (isSmartWalletSession()) {
    const calls: AABatchCall[] = [
      ...(needsApproval ? [{ to: swap.tokenIn, data: erc20.encodeFunctionData('approve', [swap.router, swap.amountIn]) as `0x${string}` }] : []),
      { to: swap.router, data: swap.data, value: swap.value },
      ...followUp,
    ];
    const tx = await writeBatchAA(calls, { chainId: swap.chainId, context: 'swap' });
    const receipt = await readWithTimeout(tx.wait(1), 'Swap confirmation', 120000);
    if (receipt.status !== 1) throw new Error('The swap did not confirm. Nothing was spent.');
    const hash = receipt.hash || tx.hash;
    return { hash, followUpHash: followUp.length ? hash : undefined };
  }
  if (needsApproval) {
    const approval = await writeContractAA(swap.tokenIn, erc20, 'approve', [swap.router, swap.amountIn], { chainId: swap.chainId, context: 'approve swap' });
    if ((await readWithTimeout(approval.wait(1), 'Approval confirmation', 120000)).status !== 1) throw new Error('The approval did not confirm');
  }
  const hash = await sendRaw(swap.chainId, swap.router, swap.data, swap.value, 'Swap');
  let followUpHash: string | undefined;
  for (const call of followUp) followUpHash = await sendRaw(swap.chainId, call.to, call.data, call.value ?? 0n, 'Transfer');
  return { hash, followUpHash };
}
