import { describe, expect, it } from 'vitest';
import catalog from '../../supabase/functions/_shared/ai-plan-offers.json';
import { AI_PLAN_POLICY_VERSION, aiPlanPriceMatches, invoicePlanMetadata, planGrantDhb } from '../../supabase/functions/_shared/ai-plans';
import { MARKUP, MARKUP_OVERRIDES, quotePriceDhb } from '../../supabase/functions/_shared/ai-pricing';
import { aiPlanBreakdownVars, getAiPlanOffer } from '../lib/ai-plan-offers';

describe('subscription offer contract', () => {
  it.each(Object.entries(catalog.offers))('%s stays within its provider budget', (key, offer) => {
    // The lowest current generation markup is 10%; retain at least 25% before fees.
    expect(offer.monthlyAllowanceDhb * 0.001 / 1.1).toBeLessThanOrEqual(offer.displayPriceUsd * 0.75);
    expect(planGrantDhb(key, 1, AI_PLAN_POLICY_VERSION)).toBe(offer.monthlyAllowanceDhb * offer.periodMonths);
    const [tier, billing] = key.split('_');
    expect(getAiPlanOffer(tier as 'creator', billing as 'monthly')).toEqual(offer);
  });

  it('preserves unversioned renewals and scales annual grants per seat', () => {
    expect(planGrantDhb('ultra_monthly')).toBe(130_000);
    expect(planGrantDhb('team_annual', 3)).toBe(88_000 * 12 * 3);
    expect(planGrantDhb('team_annual', 3, AI_PLAN_POLICY_VERSION)).toBe(52_000 * 12 * 3);
    expect(planGrantDhb('dehub_extra_monthly')).toBe(0);
    expect(planGrantDhb('ultra_monthly', 1, 'unknown')).toBe(0);
    expect(planGrantDhb('team_monthly', NaN, AI_PLAN_POLICY_VERSION)).toBe(0);
  });

  it('rejects a wrong currency, price, interval or inactive offer', () => {
    const price = { active: true, currency: 'usd', unit_amount: 118800, recurring: { interval: 'year', interval_count: 1 } };
    expect(aiPlanPriceMatches('ultra_annual', price)).toBe(true);
    expect(aiPlanPriceMatches('ultra_annual', { ...price, currency: 'gbp' })).toBe(false);
    expect(aiPlanPriceMatches('ultra_annual', { ...price, unit_amount: 9900 })).toBe(false);
    expect(aiPlanPriceMatches('ultra_annual', { ...price, recurring: { interval: 'month', interval_count: 1 } })).toBe(false);
    expect(aiPlanPriceMatches('ultra_annual', { ...price, active: false })).toBe(false);
    expect(aiPlanPriceMatches('dehub_extra_monthly', { currency: 'gbp' })).toBe(true);
  });

  it('reads policy snapshots from both Stripe invoice formats', () => {
    const metadata = { priceId: 'creator_annual', ai_plan_policy: AI_PLAN_POLICY_VERSION };
    expect(invoicePlanMetadata({ subscription_details: { metadata } })).toEqual(metadata);
    expect(invoicePlanMetadata({ parent: { subscription_details: { metadata } } })).toEqual(metadata);
    expect(invoicePlanMetadata({})).toEqual({});
  });

  it('uses current generation quotes for the displayed examples', () => {
    expect(Math.min(MARKUP, ...Object.values(MARKUP_OVERRIDES))).toBeGreaterThanOrEqual(0.1);
    expect(catalog.examplePricesDhb.nanoBananaPro).toBe(quotePriceDhb('image', 'nano-banana-pro'));
    expect(catalog.examplePricesDhb.veoFast).toBe(quotePriceDhb('video', 'veo-3.1-fast'));
    expect(catalog.examplePricesDhb.veo).toBe(quotePriceDhb('video', 'veo-3.1'));
    expect(aiPlanBreakdownVars('pricing.dhbPerMonth', 'creator', 'annual')).toEqual({ amount: '12,000' });
    expect(aiPlanBreakdownVars('pricing.equivalence', 'creator', 'annual')?.images).toBe('111');
  });
});
