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

  it('keeps breathing room inside link-preview metadata', () => {
    const preview = readSource('components/app/cards/FeedLinkPreviews.tsx');

    expect(preview.match(/px-3 pb-3 pt-3\.5 sm:pt-4/g)).toHaveLength(2);
  });

  it('separates post content from its metadata row', () => {
    const metadata = readSource('components/app/cards/PostMetadata.tsx');
    const cards = [
      readSource('components/app/cards/PostCard.tsx'),
      readSource('components/app/cards/ImageCard.tsx'),
      readSource('components/app/cards/VideoCard.tsx'),
    ];

    expect(metadata).toContain('className?: string');
    for (const card of cards) {
      expect(card).toContain('className="!mt-3"');
    }
  });

  it('clips every image state to its enclosing feed bento radius', () => {
    const imageCard = readSource('components/app/cards/ImageCard.tsx');
    const matureGate = readSource('components/app/cards/MatureContentGate.tsx');
    const styles = readSource('index.css');

    expect(imageCard.match(/data-media-full/g)).toHaveLength(5);
    expect(matureGate).toContain('<div data-media-full');
    expect(styles).toContain('[data-feed-item].rounded-xl [data-media-full]');
    expect(styles).toContain('[data-feed-item].rounded-2xl [data-media-full]');
  });

  it('releases feed bitmaps only after a generous offscreen grace period', () => {
    const imageCard = readSource('components/app/cards/ImageCard.tsx');

    expect(imageCard).toContain("const BITMAP_RETAIN_MARGIN = '1200px 100%'");
    expect(imageCard).toContain('const BITMAP_RELEASE_DELAY_MS = 15_000');
    expect(imageCard).toContain('src={retainBitmap ? img : undefined}');
    expect(imageCard).toContain('srcSet={retainBitmap ? cdnImageSrcSet(img, FEED_IMAGE_WIDTHS) : undefined}');
  });
});
