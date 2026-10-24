import { describe, expect, it } from 'vitest';
import { lyricAt, lyricLines } from './lyrics-lines';

describe('lyricLines', () => {
  it('cuts a long segment into short lines and shares out its time', () => {
    const lines = lyricLines([{ start: 10, end: 20, text: 'one two three four five six seven eight nine ten eleven twelve thirteen' }]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.text.length <= 38)).toBe(true);
    expect(lines[0].start).toBe(10);
    expect(lines[lines.length - 1].end).toBeCloseTo(20);
  });

  it('skips empty segments', () => {
    expect(lyricLines([{ start: 0, end: 1, text: '  ' }, null as never].filter(Boolean))).toEqual([]);
  });
});

describe('lyricAt', () => {
  const lines = lyricLines([
    { start: 0, end: 4, text: 'first line' },
    { start: 4, end: 8, text: 'second line' },
    { start: 30, end: 34, text: 'after the solo' },
  ]);

  it('shows the line being sung and the next one', () => {
    const { current, next } = lyricAt(lines, 5);
    expect(current?.text).toBe('second line');
    expect(next?.text).toBe('after the solo');
  });

  it('clears during a long instrumental gap', () => {
    expect(lyricAt(lines, 20).current).toBeNull();
  });

  it('shows the coming line just before it starts', () => {
    expect(lyricAt(lines, 28).next?.text).toBe('after the solo');
  });
});
