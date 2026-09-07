/**
 * Which powers a post's boost sheet may offer.
 * ============================================
 * `spendablePowers` used to exclude one power by name — Golden Hour, which
 * acts on the account. Three others act on a comment, a Stage and a category,
 * and the sheet has no field for any of them: it sends `{ tokenId, power }`
 * and the server answers "Trend Jacker needs a category". So a Cobra saw five
 * powers ticked on the SuperPowers page, four offers in the sheet, and two
 * that could actually be spent.
 *
 * `POWER_HOME` is now the one table both surfaces read. Pinned here: it covers
 * every key on the ladder, the sheet offers only the powers that act on a
 * post, and the gift still inverts.
 */
import { describe, it, expect } from 'vitest';
import { POWER_HOME, powerHome, spendablePowers } from '../use-superpowers';
import type { SuperPowerKey, SuperPowerStatus } from '@/lib/api/dehub/superpowers';

/** Every power on the ladder, unlocked, with an allowance to spend. */
const LADDER: { key: SuperPowerKey; tier: string }[] = [
  { key: 'boost', tier: 'Crab' },
  { key: 'second_wind', tier: 'Lobster' },
  { key: 'comment_anchor', tier: 'Piranha' },
  { key: 'trend_jacker', tier: 'Tortoise' },
  { key: 'timeline_bomber', tier: 'Cobra' },
  { key: 'signal_flare', tier: 'Octopus' },
  { key: 'flak_jacket', tier: 'Crocodite' },
  { key: 'precision_strike', tier: 'Dolphin' },
  { key: 'harpoon', tier: 'Tiger Shark' },
  { key: 'golden_hour', tier: 'Killer Whale' },
  { key: 'crew_boost', tier: 'Great White Shark' },
  { key: 'front_row', tier: 'Blue Whale' },
  { key: 'deep_current', tier: 'Meglodon' },
];

function status(overrides: Partial<SuperPowerStatus> = {}): SuperPowerStatus {
  return {
    boostsLeft: 3,
    signalsLeft: 3,
    powers: LADDER.map(p => ({
      key: p.key,
      label: p.key,
      summary: '',
      tier: p.tier,
      available: true,
      unlocked: true,
    })),
    ...overrides,
  } as SuperPowerStatus;
}

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('POWER_HOME', () => {
  it('places every power on the ladder', () => {
    for (const { key } of LADDER) {
      expect(POWER_HOME[key]).toBeDefined();
      expect(powerHome(key)).toBe(POWER_HOME[key]);
    }
  });
});

describe('spendablePowers', () => {
  it('offers only the powers that act on your own post', () => {
    const offered = spendablePowers(status(), YESTERDAY, true).map(p => p.key);
    // Second Wind is the other half of the age pair and belongs to older posts.
    expect(offered).toEqual([
      'boost',
      'timeline_bomber',
      'signal_flare',
      'flak_jacket',
      'precision_strike',
      'harpoon',
      'crew_boost',
    ]);
  });

  it('never offers a power the sheet cannot send a subject for', () => {
    // These three cost a boost and return a refusal — the sheet has no field
    // for a comment, a Stage or a category.
    const offered = spendablePowers(status(), YESTERDAY, true).map(p => p.key);
    expect(offered).not.toContain('comment_anchor');
    expect(offered).not.toContain('trend_jacker');
    expect(offered).not.toContain('front_row');
    expect(offered).not.toContain('golden_hour');
  });

  it('offers the gift, and only the gift, on somebody else post', () => {
    expect(spendablePowers(status(), YESTERDAY, false).map(p => p.key)).toEqual(['deep_current']);
  });

  it('hides nothing while the author is unresolved, because the server decides', () => {
    const offered = spendablePowers(status(), YESTERDAY, undefined).map(p => p.key);
    expect(offered).toContain('boost');
    expect(offered).toContain('deep_current');
    expect(offered).not.toContain('trend_jacker');
  });

  it('keeps the age half of the Boost pair', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const offered = spendablePowers(status(), old, true).map(p => p.key);
    expect(offered).toContain('second_wind');
    expect(offered).not.toContain('boost');
  });
});
