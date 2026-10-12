import { describe, expect, it } from 'vitest';
import { createIslandWaterBudget } from './island-water';

describe('Island water frame budget', () => {
  it('keeps full detail at normal cadence despite occasional stalls', () => {
    const budget = createIslandWaterBudget();
    for (let i = 0; i < 600; i++) {
      expect(budget(i % 60 === 0 ? 0.1 : 1 / 30)).toBe(1);
    }
  });

  it('reduces sustained load without oscillating once cadence recovers', () => {
    const budget = createIslandWaterBudget();
    for (let i = 0; i < 19; i++) expect(budget(0.1)).toBe(1);
    const first = budget(0.1);
    expect(first).toBe(0.85);
    for (let i = 0; i < 300; i++) expect(budget(1 / 30)).toBe(first);
    for (let i = 0; i < 80; i++) budget(0.1);
    expect(budget(1 / 30)).toBe(0.65);
    // The minimum still renders the full shader, using about 42% of its pixels.
    expect(0.65 ** 2).toBeGreaterThan(0.4);
  });

  it('does not count a pause or resize as device overload', () => {
    const budget = createIslandWaterBudget();
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 15; i++) expect(budget(0.1)).toBe(1);
      expect(budget(0)).toBe(1);
      expect(budget(10)).toBe(1);
      expect(budget(Number.NaN)).toBe(1);
    }
    expect(createIslandWaterBudget()(1 / 30)).toBe(1);
  });
});
