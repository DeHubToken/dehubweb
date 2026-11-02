/**
 * Locked DM photos and videos are priced in USD, like subscriptions. The
 * buyer pays that many dollars in DHB at the live rate, so the seller's price
 * holds whatever DHB does. The server works out the live DHB (`lock.price`);
 * these helpers cover the composer and anything the server has not priced.
 */

/**
 * Fixed DHB sale price while trading is paused. Same value as
 * DHB_PRELISTING_USD in subscription-pricing.ts; kept here so the DM API
 * does not pull in i18n through that module.
 */
export const DHB_PRELISTING_USD = 0.001;

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
  if (!(usd > 0) || !(rate > 0)) return 0;
  return Math.ceil((usd / rate) * 100) / 100;
}

export function formatLockDhb(dhb: number): string {
  return `${dhb.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB`;
}

/** The lock's USD price; locks made before dollar pricing were set at the fixed DHB price. */
export function lockUsdOf(lock: { price: number; priceUsd?: number }): number {
  return lock.priceUsd && lock.priceUsd > 0 ? lock.priceUsd : lock.price * DHB_PRELISTING_USD;
}
