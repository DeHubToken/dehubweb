/**
 * DeHub Subscription Contract
 * ===========================
 * Creator subscription plans, on chain. Creators list a plan with
 * `createPlan`; subscribers no longer buy through this contract — checkout is
 * a DHB transfer into DeHub custody (see useBuyPlan in hooks/use-subscriptions).
 *
 * **Duration is whole months, 0–12, and 0 means lifetime.** Anything else
 * reverts with "Duration should be between 0 to 12 (0 for lifetime)". n months
 * is n × 30 days, except 12, which is 365 days.
 */

import { Interface } from 'ethers';
import {
  writeContractAA,
  readContractAll,
  switchChain,
} from './aa-utils';
import { toWei, getChainConfig } from './dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import {
  SUBSCRIPTION_CONTRACTS,
  LIFETIME_DURATION,
  MAX_DURATION_MONTHS,
  isSubscriptionChain,
  normaliseDuration,
  formatDuration,
} from './subscription-plan';

export {
  SUBSCRIPTION_CONTRACTS,
  LIFETIME_DURATION,
  MAX_DURATION_MONTHS,
  isSubscriptionChain,
  normaliseDuration,
  formatDuration,
};

export const SUBSCRIPTION_ABI = [
  'function createPlan(uint256 _id, uint256 duration, string title, string description, uint256 amount, bool status, address buyCurrency)',
  'function buySubscription(address creator, uint256 _id, uint256 duration)',
  'function durationData(address creator, uint256 duration) view returns (uint256 _id, string title, string description, uint256 amount, bool status, address buyCurrency)',
  'function getSubscriptionData(address creator, address subscriber) view returns (tuple(address creator, uint256 duration, uint256 startTime, uint256 endTime)[])',
  'function _checkFeeByBadges(address creator, address recipient, uint256 duration) view returns (uint256)',
];

const subscriptionInterface = new Interface(SUBSCRIPTION_ABI);

export function getSubscriptionContract(chainId: ChainId): string {
  const address = SUBSCRIPTION_CONTRACTS[chainId];
  if (!address) {
    throw new Error(_translateCopy("copy.df6e03dedbc0", { defaultValue: "Subscriptions are not available on {{value1}}", value1: getChainConfig(chainId)?.name || chainId }));
  }
  return address;
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

// ── Writes ──

export interface PublishPlanParams {
  /** The plan id from our API — the same number both sides key on. */
  planId: string | number;
  duration: number;
  title: string;
  description?: string;
  /** Human-readable amount in the plan's payment token, e.g. 10 USDT. */
  price: number;
  chainId: ChainId;
  token: string;
  decimals: number;
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
    throw new Error(_translateCopy("copy.906f81627a6a", { defaultValue: "Plan duration must be between 0 and 12 months (0 = lifetime)" }));
  }

  const contract = getSubscriptionContract(params.chainId);
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
      toWei(params.price, params.decimals),
      true,
      params.token,
    ],
    { context: 'publish subscription plan', chainId: params.chainId },
  );

  return { hash: result.hash, confirmed: result.wait(1).then((r) => r.hash) };
}
