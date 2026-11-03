import { describe, expect, it } from 'vitest';
import {
  ARTICLE_IMAGE_MAX, articleImageMarkdown, articleImageSize, articleImages, articleLinkBlocks, articleTextLength,
  removeArticleImage, setArticleImageCaption,
} from '../article';

const url = 'https://cdn.dehub.io/article-images/a.jpg#w=1200&h=800';
const body = `Intro paragraph.\n\n${articleImageMarkdown(url)}\n\nMore text.`;

describe('article images', () => {
  it('finds pictures and their captions', () => {
    expect(articleImages(body)).toMatchObject([{ index: 0, url, caption: '' }]);
    const titled = articleImages('![alt](https://x.io/a.jpg "Shown caption")');
    expect(titled[0].caption).toBe('Shown caption');
  });

  it('sets, cleans and removes a caption', () => {
    const captioned = setArticleImageCaption(body, 0, 'Sunset [over]\nthe bay');
    expect(articleImages(captioned)[0].caption).toBe('Sunset over the bay');
    expect(captioned).toContain('More text.');
    expect(removeArticleImage(captioned, 0)).toBe('Intro paragraph.\n\nMore text.');
  });

  it('does not count picture markup as writing', () => {
    expect(articleTextLength(body)).toBe('Intro paragraph.\n\n\n\nMore text.'.length);
  });

  it('reads the size from the address', () => {
    expect(articleImageSize(url)).toEqual({ w: 1200, h: 800 });
    expect(articleImageSize('https://x.io/a.jpg')).toBeNull();
  });

  it('leaves picture lines alone in the link pass', () => {
    expect(articleLinkBlocks(body)).toContain(articleImageMarkdown(url));
  });

  it('allows 40', () => { expect(ARTICLE_IMAGE_MAX).toBe(40); });
});
