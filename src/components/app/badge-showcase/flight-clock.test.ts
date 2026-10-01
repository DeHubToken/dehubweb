import { describe, expect, it } from 'vitest';
import { flightClock } from './flight-clock';

describe('badge flight clock', () => {
  it('starts at the anchor even after a slow first GPU frame', () => {
    const elapsed = flightClock();
    expect(elapsed(2500)).toBe(0);
    expect(elapsed(2516)).toBe(16);
    expect(elapsed(2532)).toBe(32);
  });
  it('preserves visible flight after a long frame without reversing time', () => {
    const elapsed = flightClock();
    elapsed(100);
    expect(elapsed(600)).toBe(40);
    expect(elapsed(616)).toBe(56);
    expect(elapsed(610)).toBe(56);
  });
  it('can begin a first award at the reveal without an old badge', () => {
    const elapsed = flightClock(1970);
    expect(elapsed(5000)).toBe(1970);
    expect(elapsed(5016)).toBe(1986);
  });
});
