import { describe, expect, it } from 'vitest';
import { readAllPresence, coarsenCoordinate } from '../../../supabase/functions/map-presence/presence';

describe('public community map', () => {
  it('includes every member even when the database returns fewer rows than requested', async () => {
    const members = Array.from({ length: 5001 }, (_, id) => ({ id }));
    const result = await readAllPresence(async (offset, size) => members.slice(offset, offset + Math.min(size, 100)));
    expect(result).toEqual(members);
  });
  it('does not present a partial map as complete if a later page fails', async () => {
    await expect(readAllPresence(async (offset) => {
      if (offset) throw new Error('unavailable');
      return [{ id: 1 }];
    })).rejects.toThrow('unavailable');
  });
  it('keeps polar and dateline pins on the globe after rounding', () => {
    for (const bound of [90, 180]) for (const sign of [-1, 1]) {
      expect(Math.abs(coarsenCoordinate(bound * sign, 25, bound))).toBeLessThanOrEqual(bound);
    }
  });
});
