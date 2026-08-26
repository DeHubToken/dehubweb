import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Mute and block are two different things and the app now offers both. The
 * failure mode this guards is the one that was already live: a hook called
 * `useMuteAuthor` that quietly called the block API, so the ⋯ menu could only
 * ever offer one of them and the softer word was attached to the harder action.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/**
 * These files document the mute/block split in prose, so several assertions
 * below would otherwise match an explanation of the trap rather than the trap.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const MUTE_HOOK = src('hooks/use-mute-author.ts');
const BLOCK_HOOK = src('hooks/use-block-author.ts');
const MUTE_API = src('lib/api/dehub/mutes.ts');

describe('the mute hook mutes, and the block hook blocks', () => {
  it('mute calls the mute endpoint and never the block one', () => {
    expect(MUTE_HOOK).toContain('muteUser');
    expect(MUTE_HOOK).not.toContain('blockUser');
  });

  it('block calls the block endpoint and never the mute one', () => {
    expect(BLOCK_HOOK).toContain('blockUser');
    expect(BLOCK_HOOK).not.toContain('muteUser');
  });

  it('keeps their caches apart', () => {
    // Sharing ['block-list'] would make unmuting appear to unblock and vice
    // versa, and would leak muted accounts into the block list in Settings.
    //
    // Comments stripped first: both hooks explain in prose why they use
    // separate keys, and matching raw text reads that explanation as a
    // violation of the thing it is describing.
    const muteCode = stripComments(MUTE_HOOK);
    const blockCode = stripComments(BLOCK_HOOK);
    expect(muteCode).toContain("['mute-list']");
    expect(muteCode).not.toContain("['block-list']");
    expect(blockCode).toContain("['block-list']");
    expect(blockCode).not.toContain("['mute-list']");
  });

  it('hits the mute routes, not the block routes', () => {
    expect(MUTE_API).toContain("'/api/mute'");
    expect(MUTE_API).toContain('/api/mute/${encodeURIComponent');
    expect(MUTE_API).not.toContain('/api/block');
  });

  it('exposes no "muted by" call', () => {
    // A mute is private. Anything that let the muted account discover it would
    // turn it into a block with extra steps.
    //
    // Matched against code with comments stripped — the module's own docs
    // explain why `mutedYou` does not exist, and naive matching reads that
    // explanation as the thing it is warning about.
    const code = stripComments(MUTE_API);
    expect(code).not.toMatch(/muted-?by/i);
    expect(code).not.toMatch(/mutedYou/);
    expect(code).toContain('muteUser'); // the strip did not eat the file
  });
});

describe('every card offers both, and says which is which', () => {
  const CARDS = ['PostCard', 'VideoCard', 'ImageCard'] as const;

  it.each(CARDS)('%s offers mute and block as separate entries', (card) => {
    const text = src(`components/app/cards/${card}.tsx`);
    expect(text).toContain("t('postOptions.muteCreator')");
    expect(text).toContain("t('postOptions.blockCreator')");
    expect(text).toContain('handleMuteCreator' in {} ? '' : 'muteAuthor(');
    expect(text).toContain('blockAuthor(');
  });

  it('leaves no hook named for muting that actually blocks', () => {
    // The exact trap that started this: the soft word on the hard action.
    for (const card of CARDS) {
      const text = src(`components/app/cards/${card}.tsx`);
      expect(text).not.toContain("from '@/hooks/use-mute-author'\nimport { useBlockAuthor }");
      expect(text).toContain("useMuteAuthor");
      expect(text).toContain("useBlockAuthor");
    }
  });
});

describe('the Mute label is translated, not shipped English-only', () => {
  const LOCALES = resolve(__dirname, '../i18n/locales');

  it('is present in every locale file', () => {
    const files = readdirSync(LOCALES).filter((f) => f.endsWith('.json'));
    // A locale missing the key falls back to English at runtime; the coverage
    // gate only fails when EVERY locale misses it, so a per-file check is the
    // one that actually holds the line here.
    const missing = files.filter((f) => {
      const json = JSON.parse(readFileSync(resolve(LOCALES, f), 'utf8'));
      const value = json?.postOptions?.muteCreator;
      return typeof value !== 'string' || !value.trim();
    });
    expect(missing).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it('does not just repeat the English string everywhere', () => {
    // Guards a "translation" pass that copied en into all 110 files.
    const files = readdirSync(LOCALES).filter((f) => f.endsWith('.json') && f !== 'en.json');
    const english = files.filter((f) => {
      const json = JSON.parse(readFileSync(resolve(LOCALES, f), 'utf8'));
      return json?.postOptions?.muteCreator === 'Mute Account';
    });
    expect(english.length).toBeLessThan(5);
  });
});
