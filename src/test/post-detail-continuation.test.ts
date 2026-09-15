import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('dedicated post continuation', () => {
  const detail = readSource('pages/app/SinglePostPage.tsx');
  const commentsWrapper = readSource('components/app/cards/CommentsWrapper.tsx');

  it('opens one page-owned comments surface by default', () => {
    expect(detail).toContain('const [showPageComments, setShowPageComments] = useState(true)');
    expect(detail).toContain('forceInline');
    expect(detail.match(/onOpenComments=\{handleOpenPageComments\}/g)).toHaveLength(3);
  });

  it('keeps the page-owned comments surface inline on phones and immersive video', () => {
    expect(commentsWrapper).toContain('const immersiveSheet = !forceInline && isTabletOrMobile && immersive');
    expect(commentsWrapper).toContain('const phoneSheet = !forceInline && isPhone && !immersive');
    expect(commentsWrapper).toContain("'h-[60dvh] min-h-[360px] max-h-[600px] overflow-hidden md:h-auto md:min-h-0 md:max-h-[70dvh] md:overflow-y-auto'");
  });

  it('lets the desktop comments panel hug its section instead of a fixed height', () => {
    const inline = commentsWrapper.slice(commentsWrapper.indexOf('const inlineWindowClass'));
    const forceInlineClass = inline.slice(0, inline.indexOf('\n    :'));
    expect(forceInlineClass).toContain('md:h-auto');
    expect(forceInlineClass).not.toContain('md:h-[600px]');
    // Below md the section is `h-full` around an absolutely positioned list and
    // still needs a definite height from this wrapper.
    expect(forceInlineClass).toContain('h-[60dvh]');
  });

  it('renders comments before each related feed, whose first slot is an ad', () => {
    for (const feed of ['RelatedVideosFeed', 'RelatedImagesFeed', 'RelatedPostsFeed']) {
      const firstFeed = detail.indexOf(`<${feed}`);
      expect(firstFeed).toBeGreaterThan(detail.indexOf('{pageComments}'));
    }

    for (const file of ['RelatedVideosFeed.tsx', 'RelatedImagesFeed.tsx', 'RelatedPostsFeed.tsx']) {
      const source = readSource(`components/app/feeds/${file}`);
      expect(source.indexOf('<SponsoredAdCard')).toBeLessThan(source.lastIndexOf('.map(('));
    }
  });
});
