import catalog from './ai-plan-offers.json' with { type: 'json' };

/** New checkouts capture this policy; subscriptions without it keep their grant. */
export const AI_PLAN_POLICY_VERSION = catalog.version;

export interface AiPlan {
  id: string;
  name: string;
  priceId: string;
  pricedAtUsd: number;
  /** Historical monthly grant, retained for previously purchased subscriptions. */
  grantDhb: number;
  perSeat: boolean;
  periodMonths: number;
}

const legacyGrants: Record<string, number> = {
  creator: 23_000, ultra: 130_000, team: 88_000, scale: 210_000,
};

export const AI_PLANS: Record<string, AiPlan> = Object.fromEntries(
  Object.entries(catalog.offers).map(([priceId, offer]) => {
    const id = priceId.split('_')[0];
    return [priceId, {
      id, name: id[0].toUpperCase() + id.slice(1), priceId,
      pricedAtUsd: offer.displayPriceUsd,
      grantDhb: legacyGrants[id],
      perSeat: id === 'team' || id === 'scale',
      periodMonths: offer.periodMonths,
    }];
  }),
);

/** Currency, amount and interval must match the offer before a customer is created. */
export function aiPlanPriceMatches(priceId: string, price: {
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string; interval_count?: number } | null;
}): boolean {
  const offer = catalog.offers[priceId as keyof typeof catalog.offers];
  if (!offer) return true; // Legacy Premium products have their own prices.
  return price.active === true && price.currency === 'usd' &&
    price.unit_amount === Math.round(offer.displayPriceUsd * offer.periodMonths * 100) &&
    price.recurring?.interval === (offer.periodMonths === 12 ? 'year' : 'month') &&
    price.recurring.interval_count === 1;
}

/** Annual invoices deliver a year's allowance; legacy renewals remain unchanged. */
export function planGrantDhb(
  priceId: string | null | undefined,
  seats = 1,
  policyVersion?: string | null,
): number {
  if (!priceId || !Number.isSafeInteger(seats) || seats < 1) return 0;
  const plan = AI_PLANS[priceId];
  if (!plan) return 0;
  if (policyVersion && policyVersion !== AI_PLAN_POLICY_VERSION) return 0;
  const offer = catalog.offers[priceId as keyof typeof catalog.offers];
  const monthly = policyVersion === AI_PLAN_POLICY_VERSION
    ? offer.monthlyAllowanceDhb : plan.grantDhb;
  return monthly * plan.periodMonths * (plan.perSeat ? seats : 1);
}

/** Both invoice shapes carry a snapshot of the subscription metadata. */
export function invoicePlanMetadata(invoice: {
  metadata?: Record<string, string> | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
}): Record<string, string> {
  return {
    ...invoice.metadata,
    ...invoice.subscription_details?.metadata,
    ...invoice.parent?.subscription_details?.metadata,
  };
}
