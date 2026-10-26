import { describe, expect, it } from 'vitest';
import {
  ALERT_ENTER_MS,
  ALERT_LEAVE_MS,
  ALERT_MAX_WAITING,
  ALERT_MIN_HOLD_MS,
  AlertQueue,
  Tween,
  alertPose,
  cubicBezier,
  keyframes,
  linear,
  newPose,
} from './motion';

describe('cubicBezier', () => {
  it('pins both ends and matches a straight line for the linear curve', () => {
    const curve = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const x of [0, 0.1, 0.33, 0.5, 0.9, 1]) expect(curve(x)).toBeCloseTo(x, 4);
  });

  it('overshoots like the alert entrance does', () => {
    const curve = cubicBezier(0.2, 0.9, 0.25, 1.2);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => curve((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(curve(1)).toBe(1);
  });
});

describe('keyframes', () => {
  it('walks stops like a CSS animation, holding the ends', () => {
    const at = [0, 0.12, 0.72, 1];
    const op = [0, 1, 1, 0];
    expect(keyframes(-1, at, op)).toBe(0);
    expect(keyframes(0.06, at, op)).toBeCloseTo(0.5);
    expect(keyframes(0.5, at, op)).toBe(1);
    expect(keyframes(0.86, at, op)).toBeCloseTo(0.5);
    expect(keyframes(2, at, op)).toBe(0);
  });

  it('runs the timing function within each pair of stops', () => {
    const easeIn = (t: number) => t * t;
    expect(keyframes(0.25, [0, 0.5, 1], [0, 1, 0], easeIn)).toBeCloseTo(0.25);
    expect(keyframes(0.25, [0, 0.5, 1], [0, 1, 0], linear)).toBeCloseTo(0.5);
  });
});

describe('AlertQueue', () => {
  it('shows an alert at once, holds it for its duration, then leaves', () => {
    const q = new AlertQueue<{ ms: number }>((item) => item.ms);
    q.push({ ms: 5000 }, 1000);
    const slot = q.at(1000)!;
    expect(slot.start).toBe(1000);
    expect(slot.hold).toBe(5000);
    expect(slot.end).toBe(1000 + 5000 + ALERT_LEAVE_MS);
    expect(q.at(slot.end - 1)).toBe(slot);
    expect(q.at(slot.end)).toBeNull();
  });

  it('never holds an alert for less than the minimum', () => {
    const q = new AlertQueue<number>((ms) => ms);
    q.push(200, 0);
    expect(q.at(0)!.hold).toBe(ALERT_MIN_HOLD_MS);
  });

  it('starts the next alert when the last finished leaving, however late the frame that sees it', () => {
    const q = new AlertQueue<string>(() => 2000);
    q.push('a', 0);
    q.push('b', 100);
    q.push('c', 200);
    // A frame that only arrives long after both a and b were due.
    const late = 2 * (2000 + ALERT_LEAVE_MS) + 50;
    const slot = q.at(late)!;
    expect(slot.item).toBe('c');
    expect(slot.start).toBe(2 * (2000 + ALERT_LEAVE_MS));
  });

  it('gives each shown alert its own id', () => {
    const q = new AlertQueue<string>(() => 1500);
    q.push('a', 0);
    q.push('b', 0);
    const first = q.at(0)!.id;
    const second = q.at(1500 + ALERT_LEAVE_MS)!.id;
    expect(second).not.toBe(first);
  });

  it('drops the oldest waiting alert past the cap, keeping the one on screen', () => {
    const q = new AlertQueue<number>(() => 5000);
    for (let i = 0; i <= ALERT_MAX_WAITING + 2; i++) q.push(i, 0);
    expect(q.at(0)!.item).toBe(0);
    expect(q.pending).toBe(ALERT_MAX_WAITING);
    // 1 and 2 were dropped; 3 is next.
    expect(q.at(5000 + ALERT_LEAVE_MS)!.item).toBe(3);
  });

  it('starts a fresh alert at push time after the queue ran dry', () => {
    const q = new AlertQueue<string>(() => 1500);
    q.push('a', 0);
    q.push('b', 10_000);
    expect(q.at(10_000)!.start).toBe(10_000);
  });
});

describe('alertPose', () => {
  const slot = { start: 0, hold: 3000 };

  it('enters from below, faded and small', () => {
    const pose = alertPose(slot, 0, newPose());
    expect(pose.alpha).toBe(0);
    expect(pose.dy).toBeCloseTo(0.3);
    expect(pose.scale).toBeCloseTo(0.92);
  });

  it('sits still while it holds', () => {
    expect(alertPose(slot, ALERT_ENTER_MS + 1, newPose())).toEqual({ alpha: 1, dy: 0, scale: 1 });
    expect(alertPose(slot, 2999, newPose())).toEqual({ alpha: 1, dy: 0, scale: 1 });
  });

  it('never shows more than full opacity while overshooting', () => {
    for (let t = 0; t < ALERT_ENTER_MS; t += 10) expect(alertPose(slot, t, newPose()).alpha).toBeLessThanOrEqual(1);
  });

  it('rises and fades out when leaving', () => {
    const half = alertPose(slot, 3000 + ALERT_LEAVE_MS / 2, newPose());
    expect(half.alpha).toBeGreaterThan(0);
    expect(half.alpha).toBeLessThan(1);
    expect(half.dy).toBeLessThan(0);
    const gone = alertPose(slot, 3000 + ALERT_LEAVE_MS, newPose());
    expect(gone.alpha).toBe(0);
    expect(gone.dy).toBeCloseTo(-0.2);
  });
});

describe('Tween', () => {
  it('takes its first value as is, then glides to the next', () => {
    const tween = new Tween(700, linear);
    tween.set(0.2, 0);
    expect(tween.get(0)).toBe(0.2);
    tween.set(0.8, 1000);
    expect(tween.get(1000)).toBe(0.2);
    expect(tween.get(1350)).toBeCloseTo(0.5);
    expect(tween.get(1700)).toBe(0.8);
  });

  it('retargets from where it is, not where it was going', () => {
    const tween = new Tween(1000, linear);
    tween.set(0, 0);
    tween.set(1, 0);
    tween.set(0, 500);
    expect(tween.get(500)).toBeCloseTo(0.5);
    expect(tween.get(1000)).toBeCloseTo(0.25);
  });
});
