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
  });

  it('lays the page comments on the page itself: no box, no scroll of their own', () => {
    const pageBranch = commentsWrapper.slice(commentsWrapper.indexOf('if (forceInline) {'));
    const block = pageBranch.slice(0, pageBranch.indexOf('\n  }\n'));
    expect(block).toContain('page');
    // The glass window and its fixed phone height are gone, and nothing on the
    // way down may clip, or the pinned tab row and reply bar stop sticking.
    expect(block).not.toContain('backdrop-blur');
    expect(block).not.toContain('h-[60dvh]');
    expect(block).not.toContain('overflow-hidden');

    const section = readSource('components/app/cards/CommentsSection.tsx');
    expect(section).toContain('data-comment-tabs-pin={page || undefined}');
    expect(section).toContain('data-comment-composer-pin={page || undefined}');
    expect(section).toContain('sticky top-0');
    expect(section).toContain('sticky bottom-0');

    const css = readSource('index.css');
    expect(css).toContain("html:not([data-nav-hidden='true']) [data-comment-composer-pin]:not(:focus-within)");
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
