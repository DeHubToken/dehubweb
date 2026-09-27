// Kept in step with src/lib/social-pricing.ts (web) and the mobile copy.
// The server copy is the one that is enforced.
//
// Credits are priced at roughly 2x what a delivery costs dehub:
// - Zernio bills ~$3 per connected account per month (~$0.15/post at 20 posts).
// - X adds $0.20 per post carrying a link, and every cross-post carries one.
// - Farcaster goes through Neynar at well under $0.01 per cast.
// The largest bundle discount still leaves every platform above cost.

export const CREDIT_PRICE_USD = 0.10;

export const DEFAULT_PLATFORM_CREDITS = 3;
export const PLATFORM_CREDITS: Record<string, number> = { twitter: 7, farcaster: 1 };

export function creditsFor(platform: string): number {
  return PLATFORM_CREDITS[platform] ?? DEFAULT_PLATFORM_CREDITS;
}

/** Slider stops for a bulk top-up, in credits. */
export const BUNDLE_STOPS = [30, 100, 300, 600, 1000, 2500, 5000] as const;

export const MAX_TOPUP_CREDITS = 20000;

export function bundleDiscount(credits: number): number {
  if (credits >= 2500) return 0.40;
  if (credits >= 1000) return 0.30;
  if (credits >= 300) return 0.20;
  if (credits >= 100) return 0.10;
  return 0;
}

export function bundlePriceUsd(credits: number): number {
  return Math.round(credits * CREDIT_PRICE_USD * (1 - bundleDiscount(credits)) * 100) / 100;
}
