/**
 * DeHub Subscription Contract
 * ===========================
 * Creator subscription plans, on chain. Two writes and three reads:
 *
 * - `createPlan`     — the creator lists a plan. Until this lands, the plan
 *                      exists only in our database and `buySubscription`
 *                      reverts for everyone.
 * - `buySubscription`— the subscriber pays. Pulls the plan price *plus* the
 *                      platform fee out of their wallet in one call.
 *
 * Two things about this contract shape the code below, and both were
 * established by simulating it rather than read off any documentation:
 *
 * **Duration is whole months, 0–12, and 0 means lifetime.** Anything else
 * reverts with "Duration should be between 0 to 12 (0 for lifetime)". n months
 * is n × 30 days, except 12, which is 365 days.
 *
 * **The fee is charged on top of the price, not taken out of it.** A 1,000 DHB
 * plan debits the buyer 1,100 and pays the creator the full 1,000. So the
 * balance check, the approval and the number shown on the confirm button all
 * have to be price + fee, or the transaction reverts on a balance the buyer
 * was told was enough. `quoteSubscriptionFee` asks the contract for that
 * buyer's actual fee — it varies with the badges they hold.
 */

import { Interface } from 'ethers';
import {
  writeContractAA,
  readContract,
  readContractAll,
  approveERC20,
  getERC20Balance,
  getWalletAddress,
  switchChain,
} from './aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

/** Chains where the subscription contract is deployed and initialised. */
export const SUBSCRIPTION_CONTRACTS: Partial<Record<number, string>> = {
  [BASE_CHAIN_ID]: '0x91Cb5e924285484Ec666fF969D3941414fcE15d1',
  [BNB_CHAIN_ID]: '0x64eD1cEf5ba5655DAe565Ee592b6eb229e8CB05C',
};

export const SUBSCRIPTION_ABI = [
  'function createPlan(uint256 _id, uint256 duration, string title, string description, uint256 amount, bool status, address buyCurrency)',
  'function buySubscription(address creator, uint256 _id, uint256 duration)',
  'function durationData(address creator, uint256 duration) view returns (uint256 _id, string title, string description, uint256 amount, bool status, address buyCurrency)',
  'function getSubscriptionData(address creator, address subscriber) view returns (tuple(address creator, uint256 duration, uint256 startTime, uint256 endTime)[])',
  'function _checkFeeByBadges(address creator, address recipient, uint256 duration) view returns (uint256)',
];

const subscriptionInterface = new Interface(SUBSCRIPTION_ABI);

export const LIFETIME_DURATION = 0;
export const MAX_DURATION_MONTHS = 12;

export function isSubscriptionChain(chainId: number): boolean {
  return Boolean(SUBSCRIPTION_CONTRACTS[chainId]);
}

export function getSubscriptionContract(chainId: ChainId): string {
  const address = SUBSCRIPTION_CONTRACTS[chainId];
  if (!address) {
    throw new Error(`Subscriptions are not available on ${getChainConfig(chainId)?.name || chainId}`);
  }
  return address;
}

/**
 * Fold a plan duration onto what the contract will accept.
 *
 * Returns null for a value it would revert on — notably 999, which is what
 * every lifetime plan created before this was written is stored as.
 */
export function normaliseDuration(duration: unknown): number | null {
  const n = Number(duration);
  if (!Number.isInteger(n)) return null;
  if (n === 999) return LIFETIME_DURATION;
  if (n < 0 || n > MAX_DURATION_MONTHS) return null;
  return n;
}

export function formatDuration(duration: number): string {
  const n = normaliseDuration(duration);
  if (n === null) return `${duration} months`;
  if (n === LIFETIME_DURATION) return 'lifetime';
  if (n === 1) return '1 month';
  if (n === 12) return '1 year';
  return `${n} months`;
}

// ── Reads ──

export interface OnChainPlan {
  id: string;
  title: string;
  amount: bigint;
  /** False means the creator never published it — nobody can buy it. */
  status: boolean;
  buyCurrency: string;
}

export async function readOnChainPlan(
  creator: string,
  duration: number,
  chainId: ChainId,
): Promise<OnChainPlan | null> {
  const months = normaliseDuration(duration);
  if (months === null || !isSubscriptionChain(chainId)) return null;

  try {
    const data = await readContractAll<[bigint, string, string, bigint, boolean, string]>(
      getSubscriptionContract(chainId),
      subscriptionInterface,
      'durationData',
      [creator, months],
      chainId,
    );
    return {
      id: data[0].toString(),
      title: data[1],
      amount: data[3],
      status: Boolean(data[4]),
      buyCurrency: String(data[5]).toLowerCase(),
    };
  } catch (err) {
    console.warn('[Subscription] durationData read failed:', err);
    return null;
  }
}

/**
 * The platform fee this specific buyer would pay on top of the price.
 *
 * Badge holders pay less, so this cannot be a constant — it has to be asked
 * per buyer, per plan. Returns null when the read fails, which callers treat
 * as "do not claim a total you cannot stand behind".
 */
export async function quoteSubscriptionFee(
  creator: string,
  subscriber: string,
  duration: number,
  chainId: ChainId,
): Promise<bigint | null> {
  const months = normaliseDuration(duration);
  if (months === null || !isSubscriptionChain(chainId)) return null;

  try {
    return await readContract<bigint>(
      getSubscriptionContract(chainId),
      subscriptionInterface,
      '_checkFeeByBadges',
      [creator, subscriber, months],
      chainId,
    );
  } catch (err) {
    console.warn('[Subscription] fee quote failed:', err);
    return null;
  }
}

export interface OnChainSubscription {
  startDate: Date;
  endDate: Date;
  isLifetime: boolean;
}

/** Lifetime subscriptions carry `type(uint256).max` as their end time. */
const MAX_SANE_END_TIME = 253402300799n; // 9999-12-31

export async function readOnChainSubscription(
  creator: string,
  subscriber: string,
  duration: number,
  chainId: ChainId,
): Promise<OnChainSubscription | null> {
  const months = normaliseDuration(duration);
  if (months === null || !isSubscriptionChain(chainId)) return null;

  try {
    const rows = await readContract<
      Array<{ creator: string; duration: bigint; startTime: bigint; endTime: bigint }>
    >(
      getSubscriptionContract(chainId),
      subscriptionInterface,
      'getSubscriptionData',
      [creator, subscriber],
      chainId,
    );

    let best: { startTime: bigint; endTime: bigint } | null = null;
    for (const row of rows || []) {
      if (BigInt(row.duration) !== BigInt(months)) continue;
      if (!best || BigInt(row.endTime) > best.endTime) {
        best = { startTime: BigInt(row.startTime), endTime: BigInt(row.endTime) };
      }
    }
    if (!best) return null;

    const lifetime = best.endTime > MAX_SANE_END_TIME;
    return {
      startDate: new Date(Number(best.startTime) * 1000),
      endDate: lifetime ? new Date('9999-12-31T23:59:59Z') : new Date(Number(best.endTime) * 1000),
      isLifetime: lifetime,
    };
  } catch (err) {
    console.warn('[Subscription] getSubscriptionData read failed:', err);
    return null;
  }
}

// ── Writes ──

export interface PublishPlanParams {
  /** The plan id from our API — the same number both sides key on. */
  planId: string | number;
  duration: number;
  title: string;
  description?: string;
  /** Human-readable DHB, e.g. 1000 */
  price: number;
  chainId: ChainId;
}

/**
 * List a plan on chain so it can be bought.
 *
 * The contract stores plans at `durationData[creator][duration]`, so calling
 * this twice at the same duration overwrites the earlier listing rather than
 * adding one — which is why the API only allows one plan per duration.
 */
export async function publishPlanOnChain(
  params: PublishPlanParams,
): Promise<{ hash: string; confirmed: Promise<string> }> {
  const months = normaliseDuration(params.duration);
  if (months === null) {
    throw new Error('Plan duration must be between 0 and 12 months (0 = lifetime)');
  }

  const contract = getSubscriptionContract(params.chainId);
  const chainConfig = getChainConfig(params.chainId);

  await switchChain(params.chainId);

  const result = await writeContractAA(
    contract,
    subscriptionInterface,
    'createPlan',
    [
      BigInt(params.planId),
      BigInt(months),
      params.title,
      params.description || '',
      toWei(params.price, DHB_TOKEN.decimals),
      true,
      chainConfig.dhbToken,
    ],
    { context: 'publish subscription plan', chainId: params.chainId },
  );

  return { hash: result.hash, confirmed: result.wait(1).then((r) => r.hash) };
}

export interface BuySubscriptionParams {
  creator: string;
  planId: string | number;
  duration: number;
  /** Human-readable DHB list price — the fee is added on top. */
  price: number;
  chainId: ChainId;
}

export interface SubscriptionCost {
  price: bigint;
  fee: bigint;
  total: bigint;
}

/** What the buyer will actually be debited, fee included. */
export async function getSubscriptionCost(
  params: Omit<BuySubscriptionParams, 'price'> & { price: number; subscriber: string },
): Promise<SubscriptionCost> {
  const price = toWei(params.price, DHB_TOKEN.decimals);
  const fee = await quoteSubscriptionFee(
    params.creator,
    params.subscriber,
    params.duration,
    params.chainId,
  );
  // A failed quote must not understate the total. The contract's default is
  // 10%, so assume that rather than telling someone the price is the price and
  // then reverting on their balance.
  const resolvedFee = fee ?? price / 10n;
  return { price, fee: resolvedFee, total: price + resolvedFee };
}

/**
 * Buy a subscription. Approves DHB for the total (price + fee) if needed, then
 * calls the contract.
 */
export async function buySubscriptionOnChain(
  params: BuySubscriptionParams & { skipBalanceCheck?: boolean },
): Promise<{ hash: string; confirmed: Promise<string>; cost: SubscriptionCost }> {
  const months = normaliseDuration(params.duration);
  if (months === null) {
    throw new Error(
      'This plan has a duration the contract will not accept — ask the creator to recreate it',
    );
  }

  const contract = getSubscriptionContract(params.chainId);
  const chainConfig = getChainConfig(params.chainId);

  await switchChain(params.chainId);

  const subscriber = await getWalletAddress();
  if (subscriber.toLowerCase() === params.creator.toLowerCase()) {
    throw new Error('You cannot subscribe to yourself');
  }

  const cost = await getSubscriptionCost({ ...params, subscriber });

  // Confirm the plan is actually live on this chain before spending anything.
  // Without this the buyer pays gas to hit a revert whose message says nothing
  // about the creator never having published.
  const onChainPlan = await readOnChainPlan(params.creator, months, params.chainId);
  if (!onChainPlan || !onChainPlan.status) {
    throw new Error('This plan is not published on chain yet — the creator needs to publish it first');
  }

  const [balance, allowance] = await Promise.all([
    params.skipBalanceCheck
      ? Promise.resolve(cost.total)
      : getERC20Balance(chainConfig.dhbToken, subscriber),
    readContract<bigint>(
      chainConfig.dhbToken,
      new Interface(['function allowance(address owner, address spender) view returns (uint256)']),
      'allowance',
      [subscriber, contract],
      params.chainId,
    ),
  ]);

  if (!params.skipBalanceCheck && balance < cost.total) {
    const held = Number(balance) / 10 ** DHB_TOKEN.decimals;
    const needed = Number(cost.total) / 10 ** DHB_TOKEN.decimals;
    throw new Error(
      `Not enough DHB. This subscription costs ${needed.toLocaleString()} DHB including fees, and you hold ${held.toLocaleString()}.`,
    );
  }

  if (allowance < cost.total) {
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const approval = await approveERC20(chainConfig.dhbToken, contract, maxApproval, params.chainId);
    await approval.wait(1);
  }

  const result = await writeContractAA(
    contract,
    subscriptionInterface,
    'buySubscription',
    [params.creator, BigInt(params.planId), BigInt(months)],
    { context: 'subscribe', chainId: params.chainId },
  );

  return { hash: result.hash, confirmed: result.wait(1).then((r) => r.hash), cost };
}
