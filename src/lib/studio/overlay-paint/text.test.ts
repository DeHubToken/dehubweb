import { describe, expect, it, vi } from 'vitest';
import { TextKit, ellipsize, fontOf, wrapLines } from './text';

/** Ten pixels a code point: easy to reason about. */
const measure = (s: string) => Array.from(s).length * 10;

describe('ellipsize', () => {
  it('leaves text that fits alone', () => {
    expect(ellipsize('hello', 50, measure)).toBe('hello');
  });

  it('cuts to the longest start that fits with an ellipsis', () => {
    const out = ellipsize('hello world', 60, measure);
    expect(out).toBe('hello…');
    expect(measure(out)).toBeLessThanOrEqual(60);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(ellipsize('ab cdefgh', 40, measure)).toBe('ab…');
  });

  it('never splits an emoji', () => {
    const out = ellipsize('🎉🎉🎉🎉🎉', 30, measure);
    expect(out).toBe('🎉🎉…');
  });

  it('gives nothing when not even the ellipsis fits', () => {
    expect(ellipsize('hello', 5, measure)).toBe('');
    expect(ellipsize('hello', 0, measure)).toBe('');
  });
});

describe('wrapLines', () => {
  it('wraps on words', () => {
    expect(wrapLines('one two three', 70, 3, measure)).toEqual(['one two', 'three']);
  });

  it('clamps to the line count with an ellipsis, like line-clamp', () => {
    const lines = wrapLines('one two three four five six', 70, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('one two');
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1])).toBeLessThanOrEqual(70);
  });

  it('breaks a word wider than the line', () => {
    expect(wrapLines('abcdefghij', 40, 3, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('gives no lines for empty text', () => {
    expect(wrapLines('   ', 100, 2, measure)).toEqual([]);
  });
});

describe('fontOf', () => {
  it('rounds to half pixels so resizing does not mint fonts', () => {
    expect(fontOf(700, 12.26)).toBe(fontOf(700, 12.4));
    expect(fontOf(700, 12.26)).toMatch(/^700 12\.5px Exo/);
  });
});

describe('TextKit', () => {
  const fakeCtx = () => {
    const ctx = {
      font: '',
      measureText: vi.fn((s: string) => ({ width: Array.from(s).length * 10 })),
      fillText: vi.fn(),
    };
    return ctx;
  };

  it('measures each string once per font', () => {
    const ctx = fakeCtx();
    const kit = new TextKit();
    kit.use(ctx as unknown as CanvasRenderingContext2D);
    kit.font('700 10px x');
    kit.width('abc');
    kit.width('abc');
    kit.fit('abcdefgh', 50);
    kit.fit('abcdefgh', 50);
    const calls = ctx.measureText.mock.calls.length;
    kit.fit('abcdefgh', 50);
    expect(ctx.measureText.mock.calls.length).toBe(calls);
    expect(ctx.measureText.mock.calls.filter(([s]) => s === 'abc')).toHaveLength(1);
    kit.font('400 10px x');
    kit.width('abc');
    expect(ctx.measureText.mock.calls.filter(([s]) => s === 'abc')).toHaveLength(2);
  });

  it('sets the font on the context only when it changes', () => {
    const ctx = fakeCtx();
    let sets = 0;
    let font = '';
    Object.defineProperty(ctx, 'font', {
      get: () => font,
      set: (v: string) => {
        sets += 1;
        font = v;
      },
    });
    const kit = new TextKit();
    kit.use(ctx as unknown as CanvasRenderingContext2D);
    kit.font('a');
    kit.font('a');
    kit.font('b');
    expect(sets).toBe(2);
    // After a restore, the kit must set its font again.
    kit.use(ctx as unknown as CanvasRenderingContext2D);
    kit.font('b');
    expect(sets).toBe(3);
  });

  it('draws digits in equal cells so a clock does not jitter', () => {
    const ctx = fakeCtx();
    ctx.measureText.mockImplementation((s: string) => ({ width: s === '1' ? 4 : 10 }));
    const kit = new TextKit();
    kit.use(ctx as unknown as CanvasRenderingContext2D);
    kit.font('f');
    expect(kit.tabularWidth('11:11')).toBe(kit.tabularWidth('00:00'));
    kit.drawTabular('10', 0, 0);
    // '1' is centred in a 10px cell; '0' starts the next cell.
    expect(ctx.fillText.mock.calls[0][1]).toBe(3);
    expect(ctx.fillText.mock.calls[1][1]).toBe(10);
  });
});
