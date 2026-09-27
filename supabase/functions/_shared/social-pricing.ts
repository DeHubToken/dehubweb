// Kept in step with src/lib/social-pricing.ts (web) and the mobile copy.
// The server copy is the one that is enforced.

export const PRICE_PER_POST_USD = 0.10;

/** Slider stops for a bulk top-up. */
export const BUNDLE_STOPS = [10, 25, 50, 100, 250, 500, 1000] as const;

export const MAX_TOPUP_POSTS = 5000;

/** Fraction off for buying `posts` credits at once. */
export function bundleDiscount(posts: number): number {
  if (posts >= 500) return 0.40;
  if (posts >= 250) return 0.30;
  if (posts >= 100) return 0.20;
  if (posts >= 25) return 0.10;
  return 0;
}

export function bundlePriceUsd(posts: number): number {
  return Math.round(posts * PRICE_PER_POST_USD * (1 - bundleDiscount(posts)) * 100) / 100;
}
