import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps an async click handler so the button can say "heard you" immediately.
 *
 * The problem it solves: most of the app's action buttons hand their click
 * straight to an async function — a chain write, an edge function, a wallet
 * prompt. On a fast desktop the result lands before the next frame and nobody
 * notices. On a slow phone or a bad connection the button sits there looking
 * dead for a second or more, so the user taps it again, and the second tap
 * either double-fires the action or lands on a modal that is already opening.
 *
 * `run` flips `pending` true before awaiting, clears it in a `finally`, and
 * swallows re-entrant calls while a run is in flight. It never rethrows: the
 * wrapped handler keeps whatever error handling it already had, and anything
 * that escapes is surfaced by the caller's own catch rather than as an
 * unhandled rejection from an event handler.
 *
 * Unmounting mid-flight is normal here — plenty of these actions close the
 * sheet they live in — so the state write is guarded by a mounted ref.
 */
export function usePendingAction<A extends unknown[]>(
  action: (...args: A) => unknown | Promise<unknown>,
) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await action(...args);
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [action],
  );

  return { pending, run };
}
