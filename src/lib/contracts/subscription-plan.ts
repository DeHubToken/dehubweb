/**
 * Subscription plan rules that need no wallet.
 * ============================================
 * Profile pages show plans to everyone, signed in or not. These live apart
 * from subscription.ts so showing a plan card does not download the wallet
 * stack that only publishing a plan needs. subscription.ts re-exports them.
 */

import type { TFunction } from 'i18next';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from './dhb-token';

/** Chains where the subscription contract is deployed and initialised. */
export const SUBSCRIPTION_CONTRACTS: Partial<Record<number, string>> = {
  [BASE_CHAIN_ID]: '0x91Cb5e924285484Ec666fF969D3941414fcE15d1',
  [BNB_CHAIN_ID]: '0x64eD1cEf5ba5655DAe565Ee592b6eb229e8CB05C',
};

export const LIFETIME_DURATION = 0;
export const MAX_DURATION_MONTHS = 12;

export function isSubscriptionChain(chainId: number): boolean {
  return Boolean(SUBSCRIPTION_CONTRACTS[chainId]);
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
