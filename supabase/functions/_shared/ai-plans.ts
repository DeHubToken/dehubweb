/**
 * Subscription plans and their monthly DHB allowance, paid on chain.
 * ===================================================
 * The pricing page used to advertise "3,500 credits/mo = 1,750 Nano Banana Pro
 * Generations". Nothing granted those credits — there was no balance to grant
 * to — which was just as well, because at our own cost basis 1,750 Nano Banana
 * Pro runs is $525 of retail and $262 of provider spend, sold for £129. That
 * copy came from a competitor whose credit unit is not ours.
 *
 * These numbers are rebuilt from what we actually pay. Default retail is
 * provider cost x1.2, with per-model bands on top (MARKUP_OVERRIDES in
 * ai-pricing.ts), so a fully-consumed grant of G dollars costs roughly G/1.2
 * in provider spend before banding. Whether a tier's sticker price covers
 * that depends on the currency of the underlying Stripe price — which this
 * file cannot see: create-checkout resolves by lookup_key and never asserts
 * a currency. Resize the grants once that is confirmed; until then,
 * consumption breakage is what keeps the tiers safe.
 */

export interface AiPlan {
  id: string;
  name: string;
  /** Stripe lookup_key. */
  priceId: string;
  /** Headline price this grant was sized against, in USD. */
  pricedAtUsd: number;
  /** DHB delivered on chain per billing period, per seat. */
  grantDhb: number;
  /** Whether grantDhb multiplies by the subscription item quantity. */
  perSeat: boolean;
  /** Months one invoice covers; an annual invoice grants the whole year. */
  periodMonths: number;
}

export const AI_PLANS: Record<string, AiPlan> = {
  creator_monthly: {
    id: 'creator', name: 'Creator', priceId: 'creator_monthly',
    pricedAtUsd: 19, grantDhb: 23_000, perSeat: false, periodMonths: 1,
  },
  creator_annual: {
    id: 'creator', name: 'Creator', priceId: 'creator_annual',
    pricedAtUsd: 19, grantDhb: 23_000, perSeat: false, periodMonths: 12,
  },
  ultra_monthly: {
    id: 'ultra', name: 'Ultra', priceId: 'ultra_monthly',
    pricedAtUsd: 99, grantDhb: 130_000, perSeat: false, periodMonths: 1,
  },
  ultra_annual: {
    id: 'ultra', name: 'Ultra', priceId: 'ultra_annual',
    pricedAtUsd: 99, grantDhb: 130_000, perSeat: false, periodMonths: 12,
  },
  team_monthly: {
    id: 'team', name: 'Team', priceId: 'team_monthly',
    pricedAtUsd: 65, grantDhb: 88_000, perSeat: true, periodMonths: 1,
  },
  team_annual: {
    id: 'team', name: 'Team', priceId: 'team_annual',
    pricedAtUsd: 65, grantDhb: 88_000, perSeat: true, periodMonths: 12,
  },
  scale_monthly: {
    id: 'scale', name: 'Scale', priceId: 'scale_monthly',
    pricedAtUsd: 150, grantDhb: 210_000, perSeat: true, periodMonths: 1,
  },
  scale_annual: {
    id: 'scale', name: 'Scale', priceId: 'scale_annual',
    pricedAtUsd: 150, grantDhb: 210_000, perSeat: true, periodMonths: 12,
  },
};

/**
 * DHB to grant for a paid invoice. Annual plans are invoiced once a year, so
 * one invoice carries twelve months of the monthly grant.
 *
 * The legacy dehub_extra / dehub_family / dehub_xl tiers are the older Premium
 * product, not AI plans, and deliberately grant nothing — returning 0 here
 * rather than a default keeps an unpriced tier from silently paying out.
 */
export function planGrantDhb(priceId: string | null | undefined, seats = 1): number {
  if (!priceId) return 0;
  const plan = AI_PLANS[priceId];
  if (!plan) return 0;
  const perPeriod = plan.grantDhb * plan.periodMonths;
  return plan.perSeat ? perPeriod * Math.max(1, seats) : perPeriod;
}
