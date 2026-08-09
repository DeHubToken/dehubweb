import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LCS_ASSISTANT_KNOWLEDGE } from '../../supabase/functions/_shared/dehub-platform-knowledge';

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
    const chatFunctionPath = resolve('supabase/functions/general-ai-chat/index.ts');
    const chatFunction = readFileSync(chatFunctionPath, 'utf8');

    expect(chatFunction).toContain('import { LCS_ASSISTANT_KNOWLEDGE }');
    expect(chatFunction).toContain('${LCS_ASSISTANT_KNOWLEDGE}');
  });
});
