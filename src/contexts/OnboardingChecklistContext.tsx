/**
 * One onboarding checklist per session
 * ====================================
 * The "Getting started" state is read in three places — the right-rail bento,
 * the settings row that reopens it, and the completion chip on your own
 * profile. Each calling `useOnboardingChecklist()` separately would mean three
 * loads of the same row and, worse, three copies of the optimistic state that
 * drift the moment one of them ticks a step.
 *
 * So the hook runs once, here, and the rest read it.
 *
 * `useOnboarding()` returns null outside the provider rather than throwing:
 * every consumer of this is an optional ornament, and a profile card rendered
 * somewhere unusual should go without a chip, not crash.
 *
 * @module contexts/OnboardingChecklistContext
 */

import { createContext, useContext, type ReactNode } from 'react';

import {
  useOnboardingChecklist,
  type OnboardingChecklistState,
} from '@/hooks/use-onboarding-checklist';

const OnboardingChecklistContext = createContext<OnboardingChecklistState | null>(null);

export function OnboardingChecklistProvider({ children }: { children: ReactNode }) {
  const value = useOnboardingChecklist();
  return (
    <OnboardingChecklistContext.Provider value={value}>
      {children}
    </OnboardingChecklistContext.Provider>
  );
}

export function useOnboarding(): OnboardingChecklistState | null {
  return useContext(OnboardingChecklistContext);
}
