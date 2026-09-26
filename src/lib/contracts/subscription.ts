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

import type { TFunction } from 'i18next';
import { Interface } from 'ethers';
import {
  writeContractAA,
  readContractAll,
  switchChain,
} from './aa-utils';
import { toWei, getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from './dhb-token';
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

/**
 * Takes the translator rather than importing i18n: this is a contracts helper,
 * and its only caller is a component that already has one.
 */
export function formatDuration(duration: number, t: TFunction): string {
  const n = normaliseDuration(duration);
  if (n === null) return t('subscriptions.durationMonths', { count: duration });
  if (n === LIFETIME_DURATION) return t('subscriptions.durationLifetime');
  if (n === 12) return t('subscriptions.durationOneYear');
  return t('subscriptions.durationMonths', { count: n });
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
    throw new Error('Plan duration must be between 0 and 12 months (0 = lifetime)');
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
