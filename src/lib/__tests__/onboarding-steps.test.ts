import { describe, it, expect } from 'vitest';

import {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  countSettledSteps,
  isOnboardingComplete,
  nextOnboardingStep,
  onboardingPercentage,
  type OnboardingSteps,
} from '@/lib/onboarding-steps';

const settleAll = (): OnboardingSteps =>
  Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.id, { done: true }]));

describe('onboarding progress arithmetic', () => {
  it('treats an empty or missing map as no progress', () => {
    expect(countSettledSteps(undefined)).toBe(0);
    expect(countSettledSteps(null)).toBe(0);
    expect(countSettledSteps({})).toBe(0);
    expect(onboardingPercentage({})).toBe(0);
  });

  it('counts a skipped step as settled', () => {
    expect(countSettledSteps({ profile: { skipped: true } })).toBe(1);
    expect(countSettledSteps({ profile: { done: true }, wallet: { skipped: true } })).toBe(2);
  });

  it('ignores ids that are not steps any more', () => {
    expect(countSettledSteps({ 'retired-step': { done: true } })).toBe(0);
  });

  it('rounds the percentage and never leaves the 0–100 range', () => {
    expect(onboardingPercentage({ profile: { done: true } })).toBe(
      Math.round((1 / ONBOARDING_TOTAL_STEPS) * 100),
    );
    expect(onboardingPercentage(settleAll())).toBe(100);
  });

  it('is complete only once every step is settled', () => {
    expect(isOnboardingComplete({ profile: { done: true } })).toBe(false);
    expect(isOnboardingComplete(settleAll())).toBe(true);
  });

  it('points at the first unsettled step, then at nothing', () => {
    expect(nextOnboardingStep({})?.id).toBe(ONBOARDING_STEPS[0].id);
    expect(nextOnboardingStep({ [ONBOARDING_STEPS[0].id]: { skipped: true } })?.id).toBe(
      ONBOARDING_STEPS[1].id,
    );
    expect(nextOnboardingStep(settleAll())).toBeNull();
  });
});
