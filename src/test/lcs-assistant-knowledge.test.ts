import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEHUB_PLATFORM_KNOWLEDGE,
  LCS_ASSISTANT_KNOWLEDGE,
} from '../../supabase/functions/_shared/dehub-platform-knowledge';

describe('LCS assistant knowledge', () => {
  it('covers both names and the stable product facts', () => {
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('Last Chad Standing');
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('(LCS)');
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('flagship MMA battle royale');
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('licensed mixed martial artists');
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('$DHB');
  });

  it('points to the canonical guide and forbids volatile guesses', () => {
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain(
      'https://dehub.io/guides/last-chad-standing-mma-battle-royale-play-to-earn'
    );
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('Never invent prize pools, reward rates');
    expect(LCS_ASSISTANT_KNOWLEDGE).toContain('Never present an old announcement as current fact');
  });

  it('is included in the Assistant system prompt', () => {
    // LCS now reaches the prompt inside the wider platform knowledge rather
    // than as its own interpolation. The guarantee is unchanged — what the
    // assistant is told about LCS is this block, and nothing paraphrased.
    expect(DEHUB_PLATFORM_KNOWLEDGE).toContain(LCS_ASSISTANT_KNOWLEDGE);

    const chatFunctionPath = resolve('supabase/functions/general-ai-chat/index.ts');
    const chatFunction = readFileSync(chatFunctionPath, 'utf8');

    expect(chatFunction).toContain('import { DEHUB_PLATFORM_KNOWLEDGE }');
    expect(chatFunction).toContain('${DEHUB_PLATFORM_KNOWLEDGE}');
  });
});

describe('DeHub platform knowledge', () => {
  /**
   * The failure this file exists to stop is the assistant inventing a section
   * name — "check the Referrals area" for a page called Affiliate. The map is
   * only worth carrying if it names real routes, so pin the handful that were
   * actually answered wrongly in production.
   */
  it('names the real route for the things people ask about', () => {
    for (const route of ['/affiliate', '/buy', '/stake', '/superpowers', '/features', '/bookmarks']) {
      expect(DEHUB_PLATFORM_KNOWLEDGE).toContain(route);
    }
  });

  it('does not describe a shipped feature as unbuilt', () => {
    expect(DEHUB_PLATFORM_KNOWLEDGE).not.toContain('COMING SOON');
    expect(DEHUB_PLATFORM_KNOWLEDGE).toContain('already has a page');

    // The rule that makes the map load-bearing lives next to the map.
    const chatFunction = readFileSync(resolve('supabase/functions/general-ai-chat/index.ts'), 'utf8');
    expect(chatFunction).toContain('IF IT HAS A PAGE, IT EXISTS');
  });

  it('refuses to claim a generation it did not perform', () => {
    expect(DEHUB_PLATFORM_KNOWLEDGE).toContain(
      'Never claim to have done something you have not done',
    );
  });
});
