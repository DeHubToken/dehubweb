/**
 * Guided onboarding — the state behind the "Getting started" checklist
 * =====================================================================
 * Loads the signed-in member's `onboarding_progress` row, exposes the seven
 * steps with what has happened to each, and writes both the progress row and
 * the append-only `onboarding_events` log.
 *
 * Two rules this hook is built around:
 *
 * - **Nothing here may block the interface.** Every write is fire-and-forget
 *   and every failure is swallowed. Somebody who is on this checklist at all
 *   is somebody who told us the app is hard to use; a red toast because an
 *   analytics insert 409'd would be the worst possible confirmation.
 * - **Optimistic locally, durable remotely.** The step state flips in React
 *   first and is persisted after, so a slow network never makes a tick feel
 *   broken. The row is the source of truth on the next load.
 *
 * The row is created only when somebody says yes to the opt-in — `start()` —
 * so the absence of a row is a real state ("never offered, or declined"), not
 * an empty one.
 *
 * @module hooks/use-onboarding-checklist
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  countSettledSteps,
  isOnboardingComplete,
  onboardingPercentage,
  type OnboardingAction,
  type OnboardingProgressRow,
  type OnboardingStepId,
  type OnboardingSteps,
} from '@/lib/onboarding-steps';

/**
 * The generated Supabase types are regenerated from the dashboard and do not
 * carry these two tables yet, so the builders are reached through `as never`
 * the same way affiliate.ts and the other recent tables do.
 */
const db = supabase as unknown as {
  from(table: string): any;
};

export interface OnboardingChecklistState {
  /** Null until the first load finishes, and whenever there is no row. */
  progress: OnboardingProgressRow | null;
  loading: boolean;
  steps: OnboardingSteps;
  settled: number;
  total: number;
  percentage: number;
  complete: boolean;
  /** The row exists and has been neither finished nor put away. */
  active: boolean;
  /** No row, and this session has not already been asked. */
  shouldOffer: boolean;
  start: () => void;
  decline: () => void;
  markDone: (stepId: OnboardingStepId) => void;
  rate: (stepId: OnboardingStepId, rating: 'easy' | 'hard') => void;
  skip: (stepId: OnboardingStepId) => void;
  dismiss: () => void;
  reopen: () => void;
  recordView: (stepId: OnboardingStepId) => void;
}

const EMPTY_STEPS: OnboardingSteps = {};

/**
 * `dehub_is_new_account` is set by AuthProvider from the backend's
 * `isNewAccount`, and is session-scoped. It is the trigger for the opt-in
 * card, not for the checklist itself — which is exactly why the checklist
 * needs a durable row of its own.
 */
function isNewAccountSession(): boolean {
  try {
    return sessionStorage.getItem('dehub_is_new_account') === 'true';
  } catch {
    return false;
  }
}

/**
 * Remembers a "no thanks" for the rest of the browser session. Declining does
 * not create a row — there is nothing to write a dismissal on — so without
 * this the card would come straight back on the next render.
 */
const DECLINED_KEY = 'dehub.onboardingDeclined';

function hasDeclined(): boolean {
  try {
    return localStorage.getItem(DECLINED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useOnboardingChecklist(): OnboardingChecklistState {
  const { walletAddress, isAuthenticated } = useAuth();
  const [progress, setProgress] = useState<OnboardingProgressRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [declined, setDeclined] = useState<boolean>(() => hasDeclined());
  // Views are recorded once per step per mount: a re-render is not a new look
  // at the step, and the funnel counts distinct wallets anyway.
  const viewed = useRef<Set<string>>(new Set());

  const address = walletAddress ? walletAddress.toLowerCase() : null;

  useEffect(() => {
    viewed.current = new Set();
    if (!isAuthenticated || !address) {
      setProgress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await withWalletHeader(
          db
            .from('onboarding_progress')
            .select('wallet_address,started_at,completed_at,dismissed_at,steps')
            .eq('wallet_address', address)
            .maybeSingle(),
          address,
        );
        if (cancelled) return;
        setProgress((data as OnboardingProgressRow | null) || null);
      } catch {
        /* a checklist that cannot load is simply not shown */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isAuthenticated]);

  /** Append one row to the event log. Never awaited by a caller. */
  const recordEvent = useCallback(
    (stepId: string, action: OnboardingAction, rating?: 'easy' | 'hard') => {
      if (!address) return;
      try {
        void withWalletHeader(
          db.from('onboarding_events').insert({
            wallet_address: address,
            step_id: stepId,
            action,
            rating: rating ?? null,
          }),
          address,
        );
      } catch {
        /* the friction map missing one row is not worth a user seeing an error */
      }
    },
    [address],
  );

  /** Persist the whole row after an optimistic local change. */
  const persist = useCallback(
    (next: OnboardingProgressRow) => {
      if (!address) return;
      try {
        void withWalletHeader(
          db.from('onboarding_progress').upsert(
            {
              wallet_address: address,
              steps: next.steps,
              completed_at: next.completed_at,
              dismissed_at: next.dismissed_at,
            },
            { onConflict: 'wallet_address' },
          ),
          address,
        );
      } catch {
        /* kept locally for this session; the next visit re-reads the row */
      }
    },
    [address],
  );

  const mutateSteps = useCallback(
    (stepId: OnboardingStepId, patch: Partial<OnboardingSteps[string]>) => {
      setProgress((current) => {
        if (!current) return current;
        const steps: OnboardingSteps = {
          ...current.steps,
          [stepId]: { ...(current.steps?.[stepId] || {}), ...patch },
        };
        // The finish stamp is derived, not a separate action: whichever tick
        // happens to be the last one is the one that completes the tour.
        const nowComplete = isOnboardingComplete(steps);
        const next: OnboardingProgressRow = {
          ...current,
          steps,
          completed_at:
            nowComplete && !current.completed_at ? new Date().toISOString() : current.completed_at,
        };
        persist(next);
        if (nowComplete && !current.completed_at) recordEvent('all', 'finish');
        return next;
      });
    },
    [persist, recordEvent],
  );

  const start = useCallback(() => {
    if (!address) return;
    const row: OnboardingProgressRow = {
      wallet_address: address,
      started_at: new Date().toISOString(),
      completed_at: null,
      dismissed_at: null,
      steps: {},
    };
    setProgress(row);
    try {
      localStorage.removeItem(DECLINED_KEY);
    } catch {
      /* ignore */
    }
    setDeclined(false);
    try {
      void withWalletHeader(
        db.from('onboarding_progress').upsert(
          { wallet_address: address, steps: {}, completed_at: null, dismissed_at: null },
          { onConflict: 'wallet_address' },
        ),
        address,
      );
    } catch {
      /* ignore */
    }
    recordEvent('all', 'view');
  }, [address, recordEvent]);

  const decline = useCallback(() => {
    try {
      localStorage.setItem(DECLINED_KEY, 'true');
    } catch {
      /* ignore */
    }
    setDeclined(true);
    recordEvent('all', 'dismiss');
  }, [recordEvent]);

  const markDone = useCallback(
    (stepId: OnboardingStepId) => {
      mutateSteps(stepId, { done: true, skipped: false, at: new Date().toISOString() });
      recordEvent(stepId, 'complete');
    },
    [mutateSteps, recordEvent],
  );

  const skip = useCallback(
    (stepId: OnboardingStepId) => {
      mutateSteps(stepId, { skipped: true, at: new Date().toISOString() });
      recordEvent(stepId, 'skip');
    },
    [mutateSteps, recordEvent],
  );

  const rate = useCallback(
    (stepId: OnboardingStepId, rating: 'easy' | 'hard') => {
      mutateSteps(stepId, { rating });
      recordEvent(stepId, 'rating', rating);
    },
    [mutateSteps, recordEvent],
  );

  const dismiss = useCallback(() => {
    setProgress((current) => {
      if (!current) return current;
      const next = { ...current, dismissed_at: new Date().toISOString() };
      persist(next);
      return next;
    });
    recordEvent('all', 'dismiss');
  }, [persist, recordEvent]);

  const reopen = useCallback(() => {
    setProgress((current) => {
      if (!current) {
        start();
        return current;
      }
      const next = { ...current, dismissed_at: null };
      persist(next);
      return next;
    });
  }, [persist, start]);

  const recordView = useCallback(
    (stepId: OnboardingStepId) => {
      if (viewed.current.has(stepId)) return;
      viewed.current.add(stepId);
      recordEvent(stepId, 'view');
    },
    [recordEvent],
  );

  const steps = progress?.steps || EMPTY_STEPS;
  const complete = !!progress?.completed_at || isOnboardingComplete(steps);

  return {
    progress,
    loading,
    steps,
    settled: countSettledSteps(steps),
    total: ONBOARDING_TOTAL_STEPS,
    percentage: onboardingPercentage(steps),
    complete,
    active: !!progress && !progress.dismissed_at,
    shouldOffer:
      !loading && isAuthenticated && !!address && !progress && !declined && isNewAccountSession(),
    start,
    decline,
    markDone,
    rate,
    skip,
    dismiss,
    reopen,
    recordView,
  };
}

export { ONBOARDING_STEPS };
