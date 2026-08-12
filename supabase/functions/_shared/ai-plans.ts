/**
 * Subscription plans and their monthly DHB allowance.
 * ===================================================
 * The pricing page used to advertise "3,500 credits/mo = 1,750 Nano Banana Pro
 * Generations". Nothing granted those credits — there was no balance to grant
 * to — which was just as well, because at our own cost basis 1,750 Nano Banana
 * Pro runs is $525 of retail and $262 of provider spend, sold for £129. That
 * copy came from a competitor whose credit unit is not ours.
 *
 * These numbers are rebuilt from what we actually pay. Retail is 2x provider
 * cost, so granting more DHB than the sticker price still leaves margin:
 *
 *   grant of G dollars against price P  ->  provider cost G/2  ->  margin 1 - G/2P
 *
 * Each tier is sized off its *annual* (discounted) price, so a monthly
 * subscriber is strictly better business than the figures below suggest.
 */

export interface AiPlan {
  id: string;
  name: string;
  /** Stripe lookup_key. */
  priceId: string;
  /** Headline price this grant was sized against, in USD. */
  pricedAtUsd: number;
  /** DHB granted per billing period, per seat. */
  grantDhb: number;
  /** Whether grantDhb multiplies by the subscription item quantity. */
  perSeat: boolean;
}

export const AI_PLANS: Record<string, AiPlan> = {
  creator_monthly: {
    id: 'creator', name: 'Creator', priceId: 'creator_monthly',
    pricedAtUsd: 19, grantDhb: 23_000, perSeat: false,
  },
  creator_annual: {
    id: 'creator', name: 'Creator', priceId: 'creator_annual',
    pricedAtUsd: 19, grantDhb: 23_000, perSeat: false,
  },
  ultra_monthly: {
    id: 'ultra', name: 'Ultra', priceId: 'ultra_monthly',
    pricedAtUsd: 99, grantDhb: 130_000, perSeat: false,
  },
  ultra_annual: {
    id: 'ultra', name: 'Ultra', priceId: 'ultra_annual',
    pricedAtUsd: 99, grantDhb: 130_000, perSeat: false,
  },
  team_monthly: {
    id: 'team', name: 'Team', priceId: 'team_monthly',
    pricedAtUsd: 65, grantDhb: 88_000, perSeat: true,
  },
  team_annual: {
    id: 'team', name: 'Team', priceId: 'team_annual',
    pricedAtUsd: 65, grantDhb: 88_000, perSeat: true,
  },
  scale_monthly: {
    id: 'scale', name: 'Scale', priceId: 'scale_monthly',
    pricedAtUsd: 150, grantDhb: 210_000, perSeat: true,
  },
  scale_annual: {
    id: 'scale', name: 'Scale', priceId: 'scale_annual',
    pricedAtUsd: 150, grantDhb: 210_000, perSeat: true,
  },
};

/** One-off allowance on first sign-in: $1 of generation. */
export const FREE_GRANT_DHB = 1_000;

/**
 * Daily allowance: $0.40 of generation per calendar day at the peg.
 *
 * Unclaimed days accrue — someone who signs in once a week collects the whole
 * week, so an occasional visitor is not punished for not opening the app
 * daily. The accrual is capped at 30 days so a wallet that goes dormant for a
 * year cannot mint unbounded credit on its return. Paid for out of the
 * generation margins in ai-pricing.ts.
 */
export const DAILY_GRANT_DHB = 400;
export const DAILY_ACCRUAL_CAP_DHB = 12_000;

/**
 * DHB to grant for a paid invoice.
 *
 * The legacy dehub_extra / dehub_family / dehub_xl tiers are the older Premium
 * product, not AI plans, and deliberately grant nothing — returning 0 here
 * rather than a default keeps an unpriced tier from silently minting credit.
 */
export function planGrantDhb(priceId: string | null | undefined, seats = 1): number {
  if (!priceId) return 0;
  const plan = AI_PLANS[priceId];
  if (!plan) return 0;
  return plan.perSeat ? plan.grantDhb * Math.max(1, seats) : plan.grantDhb;
}
