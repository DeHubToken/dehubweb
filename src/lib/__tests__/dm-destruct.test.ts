import { describe, expect, it } from 'vitest';
import { DESTRUCT_CHOICES, destructFromChoice, destructLabel, destructLeft } from '@/lib/dm-destruct';

describe('dm-destruct', () => {
  it('offers the seven choices in order', () => {
    expect(DESTRUCT_CHOICES.map(destructLabel)).toEqual(['1 view', '1 min', '1 hour', '12 hours', '1 day', '1 week', '1 year']);
  });

  it('shows the time left on a timed message', () => {
    const now = Date.parse('2026-11-02T00:00:00Z');
    const at = (s: number) => ({ mode: 'time' as const, expiresAt: new Date(now + s * 1000).toISOString() });
    expect(destructLeft(at(45), now)).toBe('45s');
    expect(destructLeft(at(600), now)).toBe('10m');
    expect(destructLeft(at(5 * 3600), now)).toBe('5h');
    expect(destructLeft(at(3 * 86400), now)).toBe('3d');
    expect(destructLeft({ mode: 'view' }, now)).toBeNull();
  });

  it('builds the optimistic copy', () => {
    expect(destructFromChoice('view')).toEqual({ mode: 'view' });
    expect(destructFromChoice(60, 0)).toEqual({ mode: 'time', seconds: 60, expiresAt: new Date(60_000).toISOString() });
    expect(destructFromChoice(null)).toBeNull();
  });
});
