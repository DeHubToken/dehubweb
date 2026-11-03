import { describe, expect, it } from 'vitest';
import { POST_BACKGROUNDS, mergePostBg, parsePostBg } from '@/lib/post-backgrounds';

describe('profile post backgrounds', () => {
  it('ships 10 still and 10 moving backdrops with unique ids', () => {
    expect(POST_BACKGROUNDS.filter((b) => b.kind === 'still')).toHaveLength(10);
    expect(POST_BACKGROUNDS.filter((b) => b.kind === 'moving')).toHaveLength(10);
    expect(new Set(POST_BACKGROUNDS.map((b) => b.id)).size).toBe(20);
  });

  it('reads only known ids from customs', () => {
    expect(parsePostBg({ postBg: 'aurora' })?.name).toBe('Aurora');
    expect(parsePostBg({ postBg: '' })).toBeNull();
    expect(parsePostBg({ postBg: 'url(evil)' })).toBeNull();
    expect(parsePostBg(undefined)).toBeNull();
  });

  it('keeps every other customs key when saving', () => {
    expect(mergePostBg({ defaultProfileTab: 'posts', postBg: 'ink' }, 'holo')).toEqual({ defaultProfileTab: 'posts', postBg: 'holo' });
    expect(mergePostBg({ a: 1 }, null)).toEqual({ a: 1, postBg: '' });
    expect(mergePostBg({}, 'nope')).toEqual({ postBg: '' });
  });
});
