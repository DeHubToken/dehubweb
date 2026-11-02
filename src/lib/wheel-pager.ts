/**
 * Wheel / trackpad paging for the desktop Shorts viewer: the short follows the
 * fingers, a short or slow push springs back, a real swipe (or a flick) moves
 * exactly one short, and the swipe's own inertia tail can never move a second.
 *
 * Replaces `createWheelGesture`, which only ever stepped (no follow, no snap
 * back) and let a long inertia tail or a big flick earn a second step through
 * its `runDistance` / `runMs` budget: the "it scrolled 2 instead of 1" report.
 *
 * Timing is read off the events (`e.timeStamp`), never a timer, for the reason
 * in the old module's notes: overlapping swipes leave no silence to wait for.
 * The only timer is the caller's snap back, where running late is harmless.
 */

export type WheelPagerStep = 'next' | 'prev' | null;

export interface WheelPagerInput {
  deltaY: number;
  deltaMode?: number;
  /** Legacy `wheelDeltaY`: a multiple of 120 on a notched mouse wheel. */
  wheelDeltaY?: number;
  timeStamp: number;
}

export interface WheelPagerOptions {
  /** Share of the frame a slow push must cover before it commits. */
  commitRatio?: number;
  /** …capped at this many px on very tall frames. */
  commitMaxPx?: number;
  /** A push this fast (px/ms, smoothed) commits early… */
  flickSpeed?: number;
  /** …once it has covered this much. */
  flickMinPx?: number;
  /** A gap this long starts a new gesture. The capture has a 197ms gap inside one swipe's tail. */
  quietMs?: number;
  /** Input after a step is ignored this long: the slide transition. */
  lockMs?: number;
  /** A tail event this many times the tail's floor (twice running) is a new swipe. */
  surgeFactor?: number;
  /** …and never below this many px. */
  surgeMinPx?: number;
}

export interface WheelPagerResult {
  /** px to draw the pager at (negative = pulled toward the next short), or null to leave it. */
  offset: number | null;
  step: WheelPagerStep;
}

export interface WheelPager {
  read(e: WheelPagerInput, frameHeight: number, canNext: boolean, canPrev: boolean): WheelPagerResult;
  /** Called once input goes quiet. True when an uncommitted push should spring back. */
  settle(): boolean;
  reset(): void;
}

/**
 * A notched mouse wheel: line/page units (Firefox), a big opening delta, or Chrome's whole 120
 * ticks with a big pixel delta that either starts a gesture or repeats the
 * last notch exactly. `wheelDeltaY` alone is not enough: synthetic and some
 * touchpad streams report -120 on every event while their pixel deltas wander.
 */
export const isNotchedWheel = (e: WheelPagerInput, fresh: boolean, lastNotch: number): boolean =>
  (e.deltaMode ?? 0) !== 0 ||
  // A gesture that opens with a whole notch's worth (any browser's mouse, or
  // a hard trackpad flick) pages at once rather than waiting to be followed.
  (fresh && Math.abs(e.deltaY) >= 90) ||
  (!!e.wheelDeltaY && e.wheelDeltaY % 120 === 0 && Math.abs(e.deltaY) >= 50 &&
    (fresh || Math.abs(e.deltaY) === lastNotch));

export function createWheelPager(options: WheelPagerOptions = {}): WheelPager {
  const {
    commitRatio = 0.25,
    commitMaxPx = 220,
    flickSpeed = 2.5,
    flickMinPx = 60,
    quietMs = 220,
    lockMs = 350,
    surgeFactor = 2.5,
    surgeMinPx = 25,
  } = options;

  let travel = 0;
  let speed = 0;
  let lastEvent = -Infinity;
  let locked = false;
  let lockUntil = -Infinity;
  let floor = Infinity;
  let surge = 0;
  let lastSign = 0;
  let lastAbs = 0;
  let lastNotch = 0;

  const unlock = () => {
    locked = false;
    travel = 0;
    speed = 0;
    floor = Infinity;
    surge = 0;
  };

  const commit = (step: Exclude<WheelPagerStep, null>, t: number): WheelPagerResult => {
    locked = true;
    lockUntil = t + lockMs;
    travel = 0;
    floor = Infinity;
    surge = 0;
    return { offset: null, step };
  };

  return {
    read(e, frameHeight, canNext, canPrev) {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? frameHeight : 1;
      const d = e.deltaY * unit;
      const t = e.timeStamp;
      const gap = t - lastEvent;
      lastEvent = t;
      const sign = Math.sign(d);
      const abs = Math.abs(d);

      // A notched mouse wheel: every notch is a deliberate step, so it pages at
      // once (nothing to follow), one per transition.
      if (isNotchedWheel(e, gap >= quietMs, lastNotch)) {
        lastNotch = Math.abs(e.deltaY);
        if (t < lockUntil || !d) return { offset: null, step: null };
        unlock();
        const step = d > 0 ? (canNext ? 'next' : null) : (canPrev ? 'prev' : null);
        return step ? commit(step, t) : { offset: 0, step: null };
      }

      if (locked) {
        if (!d) return { offset: null, step: null };
        if (t < lockUntil) { lastAbs = abs; return { offset: null, step: null }; }
        const fresh = gap >= quietMs ||
          (lastSign !== 0 && sign !== lastSign && abs >= surgeMinPx) ||
          (() => {
            // Inertia decays; a new swipe surges back up. Two events in a row
            // over the floor and not falling away, so a lone spike or a jitter
            // inside the tail does not count.
            if (abs >= Math.max(floor * surgeFactor, surgeMinPx) && abs >= lastAbs * 0.8) surge++;
            else surge = 0;
            floor = Math.min(floor, abs);
            lastAbs = abs;
            return surge >= 2;
          })();
        lastSign = sign;
        if (!fresh) return { offset: null, step: null };
        unlock();
      } else if (gap >= quietMs) {
        // A new gesture. A reversal mid-gesture simply pulls the short back.
        travel = 0;
        speed = 0;
      }
      if (d) lastSign = sign;

      travel += d;
      const inst = abs / Math.min(Math.max(gap, 8), 50);
      speed = speed ? speed * 0.5 + inst * 0.5 : inst;

      const forward = travel > 0;
      const allowed = forward ? canNext : canPrev;
      const distance = Math.abs(travel);
      if (!allowed) {
        // Rubber band at either end: it moves, resists, and springs back.
        return { offset: -Math.sign(travel) * Math.min(120, distance * 0.3), step: null };
      }
      const commitAt = Math.min(frameHeight * commitRatio, commitMaxPx);
      if (distance >= commitAt || (speed >= flickSpeed && distance >= flickMinPx)) {
        return commit(forward ? 'next' : 'prev', t);
      }
      return { offset: -travel, step: null };
    },

    settle() {
      if (locked || travel === 0) return false;
      travel = 0;
      speed = 0;
      return true;
    },

    reset() {
      unlock();
      lastEvent = -Infinity;
      lockUntil = -Infinity;
      lastSign = 0;
    },
  };
}
