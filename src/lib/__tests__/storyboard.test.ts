import { describe, expect, it } from 'vitest';
import { storyboardOffset, toStoryboard } from '@/lib/storyboard';

const raw = { url: 'storyboards/42.jpg', spriteWidth: 192, spriteHeight: 108, spriteCount: 100, spriteDuration: 3, columns: 11 };

describe('toStoryboard', () => {
  it('turns the API shape into an absolute sheet URL', () => {
    expect(toStoryboard(raw)).toEqual({
      ...raw,
      url: 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/storyboards/42.jpg',
    });
  });

  it('skips private sheets and anything incomplete', () => {
    expect(toStoryboard({ ...raw, private: true })).toBeUndefined();
    expect(toStoryboard({ ...raw, spriteWidth: 0 })).toBeUndefined();
    expect(toStoryboard({ ...raw, url: undefined })).toBeUndefined();
    expect(toStoryboard(null)).toBeUndefined();
    expect(toStoryboard('storyboards/42.jpg')).toBeUndefined();
  });

  it('keeps an already absolute URL', () => {
    const sb = toStoryboard({ ...raw, url: 'https://cdn.example.com/s.jpg' });
    expect(sb?.url).toBe('https://cdn.example.com/s.jpg');
  });
});

describe('storyboardOffset', () => {
  const sb = toStoryboard(raw)!;

  it('finds the sprite for a moment by column and row', () => {
    expect(storyboardOffset(sb, 0)).toEqual({ x: 0, y: 0 });
    expect(storyboardOffset(sb, 2.9)).toEqual({ x: 0, y: 0 });
    expect(storyboardOffset(sb, 3)).toEqual({ x: 192, y: 0 });
    // Sprite 11 opens the second row.
    expect(storyboardOffset(sb, 33)).toEqual({ x: 0, y: 108 });
  });

  it('clamps to the sheet at both ends', () => {
    expect(storyboardOffset(sb, -5)).toEqual({ x: 0, y: 0 });
    expect(storyboardOffset(sb, NaN)).toEqual({ x: 0, y: 0 });
    // Sprite 99 is the last: column 0, row 9.
    expect(storyboardOffset(sb, 10_000)).toEqual({ x: 0, y: 9 * 108 });
  });
});
