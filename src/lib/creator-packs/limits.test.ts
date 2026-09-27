import { describe, expect, it } from 'vitest';
import * as client from './limits';
import * as server from '../../../supabase/functions/_shared/creator-pack-limits';
import { BADGE_ORDER } from '@/lib/staking-badges';

describe('creator pack limits', () => {
  it('uses the badge ladder', () => {
    expect(client.PACK_TIER_ORDER).toEqual(BADGE_ORDER);
  });

  it('matches the server table for every tier', () => {
    expect(client.PACK_TIER_ORDER).toEqual(server.PACK_TIER_ORDER);
    for (const tier of [null, 'Nobody', ...client.PACK_TIER_ORDER]) {
      expect(client.packLimitsFor(tier)).toEqual(server.packLimitsFor(tier));
    }
  });

  it('never shrinks going up the ladder', () => {
    const rows = client.PACK_TIER_ORDER.map((t) => client.packLimitsFor(t));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].packs).toBeGreaterThanOrEqual(rows[i - 1].packs);
      for (const k of client.PACK_KINDS) expect(rows[i].items[k]).toBeGreaterThanOrEqual(rows[i - 1].items[k]);
    }
  });
});
