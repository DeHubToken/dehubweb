/**
 * Time, easing and the alert queue for the canvas overlay painter.
 *
 * The DOM overlay lets CSS run its animations and setTimeout run its queue.
 * A canvas has neither: every frame is drawn from scratch, so everything that
 * moves is a pure function of the clock. The queue below is the same queue as
 * use-alert-queue.ts — one alert at a time, each held for its own duration,
 * 380ms to leave, at most eight waiting — but it is advanced by reading it
 * with the current time instead of by timers, so a frame that arrives late
 * (a busy encoder, a hidden tab) still lands every alert on schedule.
 */

export type Easing = (t: number) => number;

/**
 * CSS `cubic-bezier()`, solved for x by Newton's method with a bisection
 * fallback, as browsers do. Overshooting curves (y > 1) come back above 1 on
 * purpose: callers clamp what must not overshoot, like opacity.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30 && hi - lo > 1e-6; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const linear: Easing = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
export const ease = cubicBezier(0.25, 0.1, 0.25, 1);
export const easeIn = cubicBezier(0.42, 0, 1, 1);
export const easeOut = cubicBezier(0, 0, 0.58, 1);
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1);

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ─── Alert timing (live-overlay.css, use-alert-queue.ts) ─────────────────────

/** `ow-alert-in`: the card rises 30% of its height and grows from 92%, overshooting a touch. */
export const ALERT_ENTER_MS = 420;
export const alertEnterEase = cubicBezier(0.2, 0.9, 0.25, 1.2);
/** `ow-alert-out`: fades while rising 20% of its height. */
export const ALERT_LEAVE_MS = 380;
/** No alert is shown for less than this, however short its own duration. */
export const ALERT_MIN_HOLD_MS = 1500;
/** Past this many waiting, the oldest waiting alert is dropped: the newest is what the room is looking at. */
export const ALERT_MAX_WAITING = 8;

export interface AlertSlot<T> {
  /** Distinct per shown alert, so per-alert caches (a wheel's sprite) can key on it. */
  id: number;
  item: T;
  /** When it started entering, on the painter's clock. */
  start: number;
  /** How long it holds before leaving (at least ALERT_MIN_HOLD_MS). */
  hold: number;
  /** When it has finished leaving and the next one may enter. */
  end: number;
}

/**
 * One alert on screen at a time, the rest waiting their turn. Reading it with
 * `at(now)` moves it on: an alert whose time is up gives way to the next, which
 * enters at the moment the last one finished leaving, not at the moment of the
 * read — so a late frame does not stretch the queue.
 */
export class AlertQueue<T> {
  private waiting: T[] = [];
  private current: AlertSlot<T> | null = null;
  private seq = 0;

  constructor(private readonly durationFor: (item: T) => number) {}

  push(item: T, now: number): void {
    this.advance(now);
    this.waiting.push(item);
    if (this.waiting.length > ALERT_MAX_WAITING) this.waiting.shift();
    if (!this.current) this.startNext(now);
  }

  /** The alert on screen at `now`, or null when the queue has run dry. */
  at(now: number): AlertSlot<T> | null {
    this.advance(now);
    return this.current;
  }

  get pending(): number {
    return this.waiting.length;
  }

  clear(): void {
    this.waiting = [];
    this.current = null;
  }

  private advance(now: number) {
    while (this.current && now >= this.current.end) {
      const from = this.current.end;
      this.current = null;
      this.startNext(from);
    }
  }

  private startNext(at: number) {
    if (!this.waiting.length) return;
    const item = this.waiting.shift() as T;
    const hold = Math.max(ALERT_MIN_HOLD_MS, Number(this.durationFor(item)) || 0);
    this.seq += 1;
    this.current = { id: this.seq, item, start: at, hold, end: at + hold + ALERT_LEAVE_MS };
  }
}

/** How an alert card sits at a moment: written into, not returned, so a frame allocates nothing. */
export interface Pose {
  alpha: number;
  /** Vertical offset as a share of the card's height (positive is down). */
  dy: number;
  scale: number;
}

export const newPose = (): Pose => ({ alpha: 1, dy: 0, scale: 1 });

/**
 * The `ow-alert-in` / `ow-alert-out` pair for a slot at `now`. `enterMs` and
 * `enterEase` are overridable because the wheel enters with its own 300ms
 * ease-out.
 */
export function alertPose(
  slot: Pick<AlertSlot<unknown>, 'start' | 'hold'>,
  now: number,
  out: Pose,
  enterMs = ALERT_ENTER_MS,
  enterEase: Easing = alertEnterEase,
): Pose {
  const shown = now - slot.start;
  if (shown >= slot.hold) {
    const e = easeIn(clamp01((shown - slot.hold) / ALERT_LEAVE_MS));
    out.alpha = 1 - e;
    out.dy = -0.2 * e;
    out.scale = 1;
  } else if (shown < enterMs) {
    const e = enterEase(clamp01(shown / enterMs));
    out.alpha = clamp01(e);
    out.dy = 0.3 * (1 - e);
    out.scale = 0.92 + 0.08 * e;
  } else {
    out.alpha = 1;
    out.dy = 0;
    out.scale = 1;
  }
  return out;
}

/** `ow-enter`: a new list row or chat line slides up 30% of its height and fades in. */
export const ROW_ENTER_MS = 260;

export function rowEnter(addedAt: number, now: number, out: Pose): Pose {
  const e = easeOut(clamp01((now - addedAt) / ROW_ENTER_MS));
  out.alpha = e;
  out.dy = 0.3 * (1 - e);
  out.scale = 1;
  return out;
}

/**
 * A number that glides to each new value, like a CSS `transition` on a
 * progress bar. The first value is taken as is: a bar drawn for the first time
 * does not animate up from zero in the DOM either.
 */
export class Tween {
  private from = 0;
  private to = 0;
  private start = -Infinity;
  private settled = false;

  constructor(
    private readonly ms: number,
    private readonly easing: Easing,
  ) {}

  set(value: number, now: number): void {
    if (!this.settled) {
      this.from = this.to = value;
      this.settled = true;
      return;
    }
    if (value === this.to) return;
    this.from = this.get(now);
    this.to = value;
    this.start = now;
  }

  get(now: number): number {
    const t = (now - this.start) / this.ms;
    if (t >= 1) return this.to;
    if (t <= 0) return this.from;
    return this.from + (this.to - this.from) * this.easing(t);
  }
}

/**
 * A value through keyframe stops, the way a CSS animation walks its
 * percentages. `at` and `values` are module constants at every call
 * site, so this allocates nothing.
 */
export function keyframes(p: number, at: readonly number[], values: readonly number[], easing: Easing = linear): number {
  if (p <= at[0]) return values[0];
  for (let i = 1; i < at.length; i++) {
    if (p <= at[i]) {
      const span = at[i] - at[i - 1];
      // Like CSS, the timing function runs across each pair of stops, not the whole animation.
      const f = span > 0 ? easing((p - at[i - 1]) / span) : 1;
      return values[i - 1] + (values[i] - values[i - 1]) * f;
    }
  }
  return values[values.length - 1];
}
