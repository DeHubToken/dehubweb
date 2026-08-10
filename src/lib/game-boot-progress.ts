import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A percentage readout for a vendored game's boot.
 * ================================================
 *
 * WHERE THE NUMBER COMES FROM, AND WHY IT IS NOT MEASURED
 * -------------------------------------------------------
 * Neither of the two engines this was written for reports progress, and
 * neither can be made to. Both build the whole world inside one synchronous
 * stretch of module evaluation — War in its boot sequence, Jungle inside
 * `new Game(...)` — so there is no point during the bake at which anything
 * could be counted, let alone posted out. The one signal either frame can send
 * is "still alive" and then "ready".
 *
 * A game that DOES have a real loading screen of its own (King's Gambit counts
 * its figures as they land) should not be hidden behind this. The Arcade
 * player gives those a short tau and retires the panel on the frame's load
 * event, so the model only ever covers the gap before first paint.
 *
 * So this models the wait instead of measuring it: an exponential approach that
 * is fastest at the start and never reaches the end on its own. Two properties
 * make that honest enough to put on screen:
 *
 *   - It is MONOTONIC and always moving. Every tick advances the number, which
 *     is the actual question a user has in front of a black screen ("is this
 *     doing anything?").
 *   - It CANNOT claim to be finished. The curve is clamped below 100 and only
 *     the engine's own ready signal takes it there, so the bar never sits full
 *     over a game that has not started — the one failure that would make it
 *     worse than no bar at all.
 *
 * It runs on the host's clock rather than the frame's heartbeat, so it keeps
 * moving even if the bridge never reports; the heartbeat stays useful as a
 * liveness and error channel, not as the source of this number.
 *
 * `tauMs` is the curve's time constant: progress passes 63% at tau, 86% at 2x
 * tau, 95% at 3x. Set it to roughly half a typical bake on the machines the
 * game is aimed at and the number tracks reality closely enough that the last
 * stretch feels like a finish rather than a stall.
 */

/** Nothing below this is reported: an opening 0% reads as "did not start". */
const FLOOR = 2;
/** The curve's ceiling. Only the engine's ready signal gets past it. */
const CEILING = 99;
/** Refresh interval. Fast enough to look live, cheap enough to ignore. */
const STEP_MS = 120;
/** How long 100% stays on screen once ready, so the fill visibly lands. */
const SETTLE_MS = 320;

export interface BootProgress {
  /** Whole percent, 2-100. Never decreases. */
  pct: number;
  /** True while the readout should be mounted. Holds briefly at 100%. */
  showBoot: boolean;
  /**
   * Take the readout down now, skipping the settle hold. For the explicit hide
   * control only: someone who asks for it gone does not want to watch a
   * completion animation first, and 100% would be a lie in that path anyway.
   */
  dismiss: () => void;
}

export function useBootProgress(ready: boolean, tauMs: number): BootProgress {
  const [pct, setPct] = useState(FLOOR);
  const [showBoot, setShowBoot] = useState(true);
  // One start stamp for the life of the overlay. Deriving it from a state
  // update would restart the curve on every re-render.
  const startedRef = useRef(0);
  if (startedRef.current === 0) startedRef.current = performance.now();

  useEffect(() => {
    if (ready) return;
    const id = window.setInterval(() => {
      const t = performance.now() - startedRef.current;
      const eased = 1 - Math.exp(-t / tauMs);
      const next = Math.min(CEILING, Math.max(FLOOR, Math.round(eased * 100)));
      // Guarded rather than assigned: a tab that was backgrounded and a tau
      // that changed under us must never walk the number backwards.
      setPct((prev) => (next > prev ? next : prev));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [ready, tauMs]);

  useEffect(() => {
    if (!ready) return;
    setPct(100);
    // The fill is mid-transition when this fires, so the panel stays put long
    // enough for it to arrive. Without the hold the readout vanishes at 90-odd
    // percent and the load looks abandoned rather than finished.
    const id = window.setTimeout(() => setShowBoot(false), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [ready]);

  const dismiss = useCallback(() => setShowBoot(false), []);

  return { pct, showBoot, dismiss };
}
