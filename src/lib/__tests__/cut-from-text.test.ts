import { describe, it, expect } from 'vitest';
import { cutFromText } from '@/lib/cut-from-text';

describe('cutFromText', () => {
  it('leaves text with nothing to cut exactly as typed', () => {
    const text = 'one\n\n\n\ntwo   three\n  indented';
    expect(cutFromText(text, [])).toBe(text);
    expect(cutFromText(text, ['https://riftn.com/x'])).toBe(text);
  });

  it('keeps the writer’s blank lines and spacing around a cut link', () => {
    expect(cutFromText('Look   at\n\n\nthis https://riftn.com/x now', ['https://riftn.com/x'])).toBe('Look   at\n\n\nthis now');
  });

  it('drops a line that held only the link', () => {
    expect(cutFromText('Hi\nhttps://riftn.com/x\nBye', ['https://riftn.com/x'])).toBe('Hi\nBye');
    expect(cutFromText('Hi\n\nhttps://riftn.com/x', ['https://riftn.com/x'])).toBe('Hi');
  });
});
