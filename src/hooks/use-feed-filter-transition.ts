/**
 * Feed filter transition
 * ======================
 * Drives the loader that replaces a feed's list the instant a filter chip is
 * tapped, instead of leaving the previous results on screen while the new
 * request runs.
 *
 * Why this can't just be `isLoading`: every feed query uses
 * `placeholderData: keepPreviousData`, so switching sort keeps the OLD page
 * mounted and reports `isLoading === false`. The user gets no feedback at all
 * until the response lands and the whole list re-renders in one commit — which
 * is exactly the "it just freezes" symptom this fixes.
 *
 * Three timings, all doing real work:
 *
 *  - SETTLE_GRACE_MS covers the gap between the tap and the query actually
 *    starting. Feed params run through `useDeferredValue`/`startTransition`, so
 *    `isFetching` is still false for a few frames after the click; clearing on
 *    that first false would dismiss the loader before the fetch even begins.
 *  - MIN_VISIBLE_MS stops a warm cache hit from flashing the loader for one
 *    frame, which reads as a glitch rather than as loading.
 *  - MAX_VISIBLE_MS is the escape hatch. A stalled request must never leave the
 *    feed column showing a loader forever — the stale list plus the existing
 *    error/retry handling is a far better failure mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimum time on screen, so a cached switch doesn't strobe. */
const MIN_VISIBLE_MS = 420;
/** Window in which a not-yet-started request is still assumed to be coming. */
const SETTLE_GRACE_MS = 280;
/** Hard ceiling. A stalled feed can never trap the column. */
const MAX_VISIBLE_MS = 8000;

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export interface FeedFilterTransition {
  /** True while the loader should own the feed column. */
  active: boolean;
  /** Call synchronously from a filter chip handler, before any state update. */
  begin: () => void;
}

/**
 * @param busy Whether the feed still has work in flight — pass
 *   `isFetching || paramsNotYetApplied` so deferred param commits count as busy.
 */
export function useFeedFilterTransition(busy: boolean): FeedFilterTransition {
  const [active, setActive] = useState(false);
  const startedAt = useRef(0);
  /** Whether `busy` has gone true since begin(); see SETTLE_GRACE_MS above. */
  const sawBusy = useRef(false);

  const begin = useCallback(() => {
    startedAt.current = now();
    sawBusy.current = false;
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (busy) {
      sawBusy.current = true;
      return;
    }

    const elapsed = now() - startedAt.current;
    const wait = Math.max(
      0,
      MIN_VISIBLE_MS - elapsed,
      // Not busy and never was: the request may still be a frame or two away.
      sawBusy.current ? 0 : SETTLE_GRACE_MS - elapsed,
    );

    const id = window.setTimeout(() => setActive(false), wait);
    return () => window.clearTimeout(id);
  }, [active, busy]);

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setActive(false), MAX_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [active]);

  return { active, begin };
}

export default useFeedFilterTransition;
