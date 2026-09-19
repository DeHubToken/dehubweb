import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../components/app/feeds/HomeFeed.tsx'), 'utf8');

describe('boosted home-feed placement', () => {
  it('keeps the boost in the featured slot only on the default home feed', () => {
    expect(source).toContain(
      'const boostedPostId = isDefaultHomeView && boostSlot ? String(boostSlot.tokenId) : undefined;',
    );
    expect(source.indexOf('{pinnedItem && (')).toBeLessThan(source.indexOf('{renderFeedWithShorts()}'));
  });
});
