import { describe, expect, it } from 'vitest';
import { storageImage } from '../media-url';

const STORAGE = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1';
const BANNER = `${STORAGE}/object/public/community-media/dehub-debates/banner.png`;

describe('storageImage', () => {
  it('routes a public storage object through the resizer, keeping its aspect ratio', () => {
    expect(storageImage(BANNER, 736)).toBe(
      `${STORAGE}/render/image/public/community-media/dehub-debates/banner.png?width=736&quality=80&resize=contain`,
    );
  });

  it('appends to an existing query string', () => {
    expect(storageImage(`${BANNER}?t=1`, 96)).toBe(
      `${STORAGE}/render/image/public/community-media/dehub-debates/banner.png?t=1&width=96&quality=80&resize=contain`,
    );
  });

  it('leaves everything it cannot or should not resize untouched', () => {
    expect(storageImage(undefined, 96)).toBeUndefined();
    expect(storageImage(null, 96)).toBeUndefined();
    expect(storageImage('blob:https://dehub.io/abc', 96)).toBe('blob:https://dehub.io/abc');
    expect(storageImage('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/1.jpg', 96)).toBe(
      'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/1.jpg',
    );
    const gif = `${STORAGE}/object/public/community-media/x/avatar.gif`;
    expect(storageImage(gif, 96)).toBe(gif);
    // Another project's storage may not have transformations enabled.
    const foreign = 'https://otherproject.supabase.co/storage/v1/object/public/a/b.png';
    expect(storageImage(foreign, 96)).toBe(foreign);
  });
});
