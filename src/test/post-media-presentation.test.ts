import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('post media presentation', () => {
  it('loads the primary image eagerly on the post detail surface', () => {
    const detail = readSource('pages/app/SinglePostPage.tsx');
    const imageCard = readSource('components/app/cards/ImageCard.tsx');

    expect(detail).toContain('<ImageCard post={toImagePost(post)} aboveFold />');
    expect(imageCard).toContain("loading={aboveFold && idx === 0 ? 'eager' : 'lazy'}");
    expect(imageCard).toContain("fetchPriority={aboveFold && idx === 0 ? 'high' : 'auto'}");
    expect(imageCard).toContain("loading={aboveFold ? 'eager' : 'lazy'}");
  });

  it('keeps breathing room between link-preview media and metadata', () => {
    const preview = readSource('components/app/cards/FeedLinkPreviews.tsx');

    expect(preview.match(/px-3 pb-3 pt-3\.5 sm:pt-4/g)).toHaveLength(2);
  });
});
