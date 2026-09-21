/**
 * Guided onboarding — the steps, and the arithmetic over them
 * ===========================================================
 * The "Getting started" checklist is seven things, in the order they stop
 * blocking each other: you cannot sensibly post before you have a name, and
 * "how earning works" only means anything once you have seen a feed.
 *
 * Kept away from the components so the order is one list rather than three,
 * and so the progress arithmetic — which is what the bento, the settings row
 * and the profile chip all actually render — is testable without React.
 *
 * Every id here is written to `onboarding_events.step_id` and read back by the
 * admin friction map, so an id is a stored value: rename one and the history
 * for that step silently splits in two.
 *
 * @module lib/onboarding-steps
 */

/** A step's outcome as stored in `onboarding_progress.steps`. */
export interface OnboardingStepState {
  done?: boolean;
  at?: string | null;
  rating?: 'easy' | 'hard' | null;
  skipped?: boolean;
}

export type OnboardingSteps = Record<string, OnboardingStepState>;

export interface OnboardingProgressRow {
  wallet_address: string;
  started_at: string;
  completed_at: string | null;
  dismissed_at: string | null;
  steps: OnboardingSteps;
}

/** What an event row can say. Mirrors the CHECK constraint on the table. */
export type OnboardingAction = 'view' | 'complete' | 'skip' | 'rating' | 'dismiss' | 'finish';

export type OnboardingStepId =
  | 'profile'
  | 'wallet'
  | 'feed'
  | 'first-post'
  | 'follow'
  | 'comment'
  | 'rewards';

export interface OnboardingStepDef {
  id: OnboardingStepId;
  /**
   * Where the Go button takes you. `null` means the step opens something
   * in place — the post composer — rather than navigating.
   */
  route: string | null;
  /** Lucide icon name, resolved by the component so this file stays data. */
  icon: 'UserRound' | 'Wallet' | 'Sparkles' | 'PenLine' | 'UsersRound' | 'MessageCircle' | 'Trophy';
}

/**
 * The seven steps. Titles and bodies live in `onboarding.steps.<id>.*` —
 * every destination below is an existing route, checked against App.tsx.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  { id: 'profile', route: '/app/settings', icon: 'UserRound' },
  { id: 'wallet', route: '/app/wallet', icon: 'Wallet' },
  { id: 'feed', route: '/prompt', icon: 'Sparkles' },
  // The composer is a modal over whatever page you are on, so this one has no
  // route: sending someone to /app/upload would be a different, heavier flow
  // than the one the rest of the app nudges people into.
  { id: 'first-post', route: null, icon: 'PenLine' },
  { id: 'follow', route: '/app/explore', icon: 'UsersRound' },
  { id: 'comment', route: '/app', icon: 'MessageCircle' },
  { id: 'rewards', route: '/app/superpowers', icon: 'Trophy' },
] as const;

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

/**
 * How many steps are behind you.
 *
 * A skipped step counts: the checklist is a tour, not a quest, and refusing to
 * link a wallet should not leave somebody staring at "6 of 7" forever. Only
 * steps that still exist are counted, so dropping a step from the list does
 * not leave old rows reporting more progress than there is.
 */
export function countSettledSteps(steps: OnboardingSteps | null | undefined): number {
  if (!steps) return 0;
  return ONBOARDING_STEPS.reduce((total, step) => {
    const state = steps[step.id];
    return total + (state?.done || state?.skipped ? 1 : 0);
  }, 0);
}

/** Whole-number percentage, clamped to 0–100, for the progress bar. */
export function onboardingPercentage(steps: OnboardingSteps | null | undefined): number {
  if (ONBOARDING_TOTAL_STEPS === 0) return 100;
  const settled = countSettledSteps(steps);
  return Math.max(0, Math.min(100, Math.round((settled / ONBOARDING_TOTAL_STEPS) * 100)));
}

/** True once every step has been done or skipped. */
export function isOnboardingComplete(steps: OnboardingSteps | null | undefined): boolean {
  return countSettledSteps(steps) >= ONBOARDING_TOTAL_STEPS;
}

/**
 * The step to put in front of the person next: the first one not yet settled.
 * Returns null when there is nothing left, which is what switches the bento to
 * its thank-you state.
 */
export function nextOnboardingStep(
  steps: OnboardingSteps | null | undefined,
): OnboardingStepDef | null {
  return (
    ONBOARDING_STEPS.find((step) => {
      const state = steps?.[step.id];
      return !state?.done && !state?.skipped;
    }) || null
  );
}
