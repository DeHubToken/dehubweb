import { describe, it, expect, beforeEach } from 'vitest';
import {
  isHourWithin,
  isQuietNow,
  getQuietHours,
  QH_ENABLED_KEY,
  QH_START_KEY,
  QH_END_KEY,
} from '@/lib/quiet-hours';

describe('isHourWithin', () => {
  it('handles a same-day window', () => {
    // 09:00 → 17:00
    expect(isHourWithin(8, 9, 17)).toBe(false);
    expect(isHourWithin(9, 9, 17)).toBe(true);  // start is inclusive
    expect(isHourWithin(16, 9, 17)).toBe(true);
    expect(isHourWithin(17, 9, 17)).toBe(false); // end is exclusive
  });

  it('handles a window that wraps midnight', () => {
    // 22:00 → 08:00, the default and the common case
    expect(isHourWithin(21, 22, 8)).toBe(false);
    expect(isHourWithin(22, 22, 8)).toBe(true);
    expect(isHourWithin(23, 22, 8)).toBe(true);
    expect(isHourWithin(0, 22, 8)).toBe(true);
    expect(isHourWithin(7, 22, 8)).toBe(true);
    expect(isHourWithin(8, 22, 8)).toBe(false);
    expect(isHourWithin(12, 22, 8)).toBe(false);
  });

  it('treats a zero-width window as never silenced', () => {
    // More likely a mis-set control than a request to mute forever.
    for (const h of [0, 5, 12, 22, 23]) {
      expect(isHourWithin(h, 12, 12)).toBe(false);
    }
  });

  it('covers every hour when the window is 23 wide', () => {
    const silenced = Array.from({ length: 24 }, (_, h) => isHourWithin(h, 1, 0));
    expect(silenced.filter(Boolean)).toHaveLength(23);
    expect(isHourWithin(0, 1, 0)).toBe(false);
  });
});

describe('getQuietHours', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to 22 → 08 when nothing is stored', () => {
    expect(getQuietHours()).toEqual({ enabled: false, start: 22, end: 8 });
  });

  it('ignores out-of-range and non-numeric stored hours', () => {
    localStorage.setItem(QH_START_KEY, '99');
    localStorage.setItem(QH_END_KEY, 'banana');
    const { start, end } = getQuietHours();
    expect(start).toBe(22);
    expect(end).toBe(8);
  });

  it('reads stored values back', () => {
    localStorage.setItem(QH_ENABLED_KEY, 'true');
    localStorage.setItem(QH_START_KEY, '1');
    localStorage.setItem(QH_END_KEY, '6');
    expect(getQuietHours()).toEqual({ enabled: true, start: 1, end: 6 });
  });
});

describe('isQuietNow', () => {
  beforeEach(() => localStorage.clear());

  const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0);

  it('is never quiet while disabled, even inside the window', () => {
    localStorage.setItem(QH_START_KEY, '22');
    localStorage.setItem(QH_END_KEY, '8');
    expect(isQuietNow(at(23))).toBe(false);
  });

  it('silences inside a midnight-wrapping window once enabled', () => {
    localStorage.setItem(QH_ENABLED_KEY, 'true');
    localStorage.setItem(QH_START_KEY, '22');
    localStorage.setItem(QH_END_KEY, '8');
    expect(isQuietNow(at(23))).toBe(true);
    expect(isQuietNow(at(3))).toBe(true);
    expect(isQuietNow(at(9))).toBe(false);
  });
});
