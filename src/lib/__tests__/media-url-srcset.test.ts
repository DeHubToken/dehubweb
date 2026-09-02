import { describe, expect, it } from 'vitest';
import { cdnImage, cdnImageSrcSet } from '../media-url';

const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';
const RAW = `${CDN}/feed-images/2038-1.jpg`;

describe('cdnImageSrcSet', () => {
  it('issues one transform per width from a raw CDN URL', () => {
    const set = cdnImageSrcSet(RAW, [480, 1080]);
    expect(set).toBe(
      `https://dehub.io/cdn-cgi/image/format=auto,quality=80,width=480/${RAW} 480w, ` +
        `https://dehub.io/cdn-cgi/image/format=auto,quality=80,width=1080/${RAW} 1080w`,
    );
  });

  it('re-sizes a URL cdnImage() already wrapped and keeps its quality and fit', () => {
    const wrapped = cdnImage(RAW, { width: 1080, quality: 70, fit: 'cover' });
    const set = cdnImageSrcSet(wrapped, [720])!;
    expect(set).toBe(`https://dehub.io/cdn-cgi/image/format=auto,quality=70,width=720,fit=cover/${RAW} 720w`);
    // the source is not double-wrapped
    expect(set.split('cdn-cgi').length).toBe(2);
  });

  it('returns undefined for anything it cannot resize, so the caller omits srcset', () => {
    expect(cdnImageSrcSet(undefined, [480])).toBeUndefined();
    expect(cdnImageSrcSet('https://api.dicebear.com/7.x/thumbs/svg?seed=x', [480])).toBeUndefined();
    expect(cdnImageSrcSet(`${CDN}/images/loop.gif`, [480])).toBeUndefined();
    expect(cdnImageSrcSet(cdnImage(`${CDN}/images/loop.gif`, { width: 300 }), [480])).toBeUndefined();
  });
});
