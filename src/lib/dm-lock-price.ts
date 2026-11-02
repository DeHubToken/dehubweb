/**
 * Locked DM photos and videos are priced in USD, like subscriptions. The
 * buyer pays that many dollars in DHB at the live rate, so the seller's price
 * holds whatever DHB does. The server works out the live DHB (`lock.price`);
 * these helpers cover the composer and anything the server has not priced.
 */
import { DHB_PRELISTING_USD, dhbForUsd } from '@/lib/subscription-pricing';

export { DHB_PRELISTING_USD };

export const LOCK_QUICK_USD = [1, 5, 10];
export const LOCK_DEFAULT_USD = 5;
export const LOCK_MIN_USD = 0.1;
export const LOCK_MAX_USD = 10_000;

/** "$5" or "$2.50". */
export function formatLockUsd(usd: number): string {
  const whole = Math.abs(usd - Math.round(usd)) < 0.005;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** DHB for a dollar price, rounded up to two decimals. */
export function lockDhbForUsd(usd: number, rate = DHB_PRELISTING_USD): number {
  const dhb = dhbForUsd(usd, rate);
  return dhb === null ? 0 : Math.ceil(dhb * 100) / 100;
}

export function formatLockDhb(dhb: number): string {
  return `${dhb.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB`;
}

/** The lock's USD price; locks made before dollar pricing were set at the fixed DHB price. */
export function lockUsdOf(lock: { price: number; priceUsd?: number }): number {
  return lock.priceUsd && lock.priceUsd > 0 ? lock.priceUsd : lock.price * DHB_PRELISTING_USD;
}
