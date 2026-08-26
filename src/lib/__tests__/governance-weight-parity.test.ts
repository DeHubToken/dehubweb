/**
 * The governance vote ladder exists twice.
 * ========================================
 * `src/lib/staking-badges.ts` is the ladder the whole site draws badges from,
 * and `supabase/functions/_shared/badge-weight.ts` is the copy the vote
 * function weighs a vote with. The copy exists because the original imports
 * thirteen badge images through Vite's `@/assets` alias, which no Deno
 * function can resolve.
 *
 * A weight that disagrees between the two is the worst kind of bug here: the
 * panel tells someone their vote counts eleven times, the server records nine,
 * and nothing errors. So the copy is checked against the original rather than
 * trusted, along with the rule that makes the ladder a ladder — one step per
 * tier, Crab at 1 through Meglodon at 13.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGE_LEVELS } from '@/lib/staking-badges';
import { BADGE_VOTE_WEIGHT } from '@/hooks/use-governance';

const serverModule = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/badge-weight.ts'),
  'utf8',
);

/** The `{ name, min }` entries the Deno copy declares, in order. */
function serverLadder(): { name: string; min: number }[] {
  const block = serverModule.match(/const BADGE_LEVELS[^=]*=\s*\[([\s\S]*?)\];/);
  expect(block, 'badge-weight.ts no longer declares BADGE_LEVELS').toBeTruthy();
  return [...block![1].matchAll(/\{\s*name:\s*"([^"]+)",\s*min:\s*(\d+)\s*\}/g)].map((m) => ({
    name: m[1],
    min: Number(m[2]),
  }));
}

describe('governance vote weight', () => {
  it('gives every tier exactly one more step than the one below it', () => {
    const weights = BADGE_LEVELS.map((tier) => BADGE_VOTE_WEIGHT[tier.name]);
    expect(weights).toEqual(BADGE_LEVELS.map((_, index) => index + 1));
  });

  it('weighs every tier on the ladder and invents none', () => {
    expect(Object.keys(BADGE_VOTE_WEIGHT).sort()).toEqual(BADGE_LEVELS.map((b) => b.name).sort());
  });

  it('keeps the edge function ladder identical to the app ladder', () => {
    expect(serverLadder()).toEqual(BADGE_LEVELS.map(({ name, min }) => ({ name, min })));
  });

  it('keeps the anchor price and scale clamps identical to the app', () => {
    expect(serverModule).toContain('const BADGE_PRICE_ANCHOR = 0.001;');
    expect(serverModule).toContain('const MAX_BADGE_SCALE = 1;');
    expect(serverModule).toContain('const MIN_BADGE_SCALE = 0.001;');
  });

  it('keeps the username overrides identical to the app', () => {
    // An override hands out a tier with no balance behind it, so the two lists
    // disagreeing means someone votes at 13x on one side and 0 on the other.
    const app = readFileSync(resolve(__dirname, '../staking-badges.ts'), 'utf8');
    const names = (source: string) =>
      [...source.matchAll(/USERNAME_BADGE_OVERRIDES[^=]*=\s*\{([\s\S]*?)\};/g)]
        .flatMap((m) => [...m[1].matchAll(/["']?([A-Za-z0-9_]+)["']?\s*:\s*"([^"]+)"/g)])
        .map((m) => `${m[1].toLowerCase()}:${m[2]}`)
        .sort();
    expect(names(serverModule)).toEqual(names(app));
  });
});
