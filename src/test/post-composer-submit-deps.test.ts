/**
 * `handlePost` must depend on everything it sends.
 *
 * It is a `useCallback`, so React only rebuilds it when one of its listed
 * dependencies changes — in practice, the creator's last keystroke. Anything
 * the body reads but the array omits is therefore frozen at whatever it was
 * then, and the composer silently posts stale values.
 *
 * That is not hypothetical: `shopLinks` and `shopListingIds` were missing, so
 * affiliate links or store listings added after the caption was typed reached
 * the mint as `undefined`. The post published with an empty shop board, no
 * error, nothing in the logs. `selectedCategory` had the same shape — pick a
 * category last and the post files itself under General.
 *
 * The list below is the composer state the body reads. Nothing here needs a
 * browser, so it is a cheap guard against the array drifting again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Values `handlePost` reads out of composer state and sends with the post. */
const MUST_DEPEND_ON = [
  'selectedCategory',
  'shopLinks',
  'shopListingIds',
  'ppvCurrency',
  'myPlanIds',
];

function handlePostDependencies(src: string): string {
  const start = src.indexOf('const handlePost = useCallback(');
  expect(start, 'handlePost should still be a useCallback').toBeGreaterThan(-1);

  // The dependency array is the first `}, [ … ]);` that closes after it.
  const openIdx = src.indexOf('\n  }, [', start);
  expect(openIdx, 'handlePost should still declare a dependency array').toBeGreaterThan(-1);
  const closeIdx = src.indexOf('\n  ]);', openIdx);
  expect(closeIdx, 'handlePost dependency array should be closed').toBeGreaterThan(openIdx);

  return src.slice(openIdx, closeIdx);
}

describe('post composer submit dependencies', () => {
  const src = readFileSync(join(process.cwd(), 'src/features/post/hooks/usePostForm.ts'), 'utf8');
  const deps = handlePostDependencies(src);

  for (const name of MUST_DEPEND_ON) {
    it(`lists ${name}, which handlePost sends`, () => {
      // Read somewhere in the file, or the entry below is guarding nothing.
      expect(src).toContain(name);
      expect(deps).toContain(name);
    });
  }

  it('still carries the shop board and the picked listings to the mint', () => {
    // The two fields whose absence published an empty board. If either moves,
    // this test and the dependency list above have to move with it.
    expect(src).toMatch(/shopLinks: shopLinks\.length \? shopLinks : undefined/);
    expect(src).toMatch(/shopListingCount: shopListingIds\.length \|\| undefined/);
  });
});
