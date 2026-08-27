/**
 * Turns a raw wheel stream into discrete "go to the next / previous item" steps.
 *
 * Written against a real capture from a Windows laptop trackpad (see
 * `src/test/wheel-gesture.test.ts`, which replays it). Two things about that
 * stream drive every decision here:
 *
 * 1. **One physical swipe is not one wheel event, or ten — it is a second of
 *    them.** A single flick produced 31 events spread over 983ms, deltas
 *    running 2 → 339 → 21 as the driver's inertia decayed. Anything that
 *    advances per event, or per 40px of travel, advances a dozen videos.
 * 2. **Swipes overlap.** The next swipe lands while the previous one is still
 *    coasting, so the stream simply never stops: 104 events over two seconds
 *    with no gap longer than 200ms. There is no reliable moment of silence to
 *    key off, and any rule that waits for one waits forever.
 *
 * The rule this replaced set a lock on each step and released it from a 220ms
 * `setTimeout` re-armed by every event — so releasing required a gap of 220ms
 * *of wall clock* to open up AND the timer to actually fire inside it. In the
 * capture the gap between two swipes was 254ms, i.e. 34ms of slack, and under
 * the load of a playing video the timer lost that race. Once it lost, every
 * later event re-armed it and the feed was dead until the user stopped to move
 * the mouse. Timing is therefore read off the events themselves here — never a
 * timer, which can only ever be late.
 */

export type WheelStep = 'next' | 'prev' | null;

export interface WheelGestureOptions {
  /** Travel that triggers the first step of a gesture. Small: this is the one that has to feel instant. */
  nudge?: number;
  /** No events for this long means the gesture is over and the next one starts fresh. */
  quietMs?: number;
  /** Input is dropped outright for this long after a step, so one swipe's own tail cannot stack up behind the animation and fire the moment it ends. Match the transition. */
  cooldownMs?: number;
  /** Travel that earns another step while the stream never stops. Roughly one full swipe's worth. */
  runDistance?: number;
  /** …or this long of unbroken scrolling, which covers a slow, steady stream that never covers `runDistance`. */
  runMs?: number;
}

export interface WheelGesture {
  /** Feed it `e.deltaY` and `e.timeStamp`. Returns a step to take, or null. */
  read(deltaY: number, timeStamp: number): WheelStep;
  reset(): void;
}

export function createWheelGesture(options: WheelGestureOptions = {}): WheelGesture {
  const {
    nudge = 40,
    quietMs = 220,
    cooldownMs = 350,
    runDistance = 1300,
    runMs = 1200,
  } = options;

  let travel = 0;
  let lastEvent = -Infinity;
  let lastStep: number | null = null;
  let cooldownUntil = -Infinity;

  return {
    read(deltaY, timeStamp) {
      // A real break in the stream — the fingers came off the trackpad, or the
      // wheel stopped. Whatever comes next is a new gesture and gets the cheap
      // `nudge` threshold again.
      if (timeStamp - lastEvent >= quietMs) {
        travel = 0;
        lastStep = null;
      }
      lastEvent = timeStamp;

      if (timeStamp < cooldownUntil) return null;

      // Reversing mid-stream starts over rather than paying off the travel
      // already banked in the other direction.
      if (travel !== 0 && deltaY !== 0 && Math.sign(deltaY) !== Math.sign(travel)) {
        travel = 0;
      }
      travel += deltaY;

      const distance = Math.abs(travel);
      const enough = lastStep === null
        ? distance >= nudge
        : distance >= runDistance || (timeStamp - lastStep >= runMs && distance >= nudge);
      if (!enough) return null;

      const step: WheelStep = travel > 0 ? 'next' : 'prev';
      travel = 0;
      lastStep = timeStamp;
      cooldownUntil = timeStamp + cooldownMs;
      return step;
    },

    reset() {
      travel = 0;
      lastEvent = -Infinity;
      lastStep = null;
      cooldownUntil = -Infinity;
    },
  };
}
