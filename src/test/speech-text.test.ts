import { describe, expect, it } from 'vitest';
import { speechSentences, speechText } from '@/lib/speech-text';

describe('speechText', () => {
  it('cuts a long reply at the last whole sentence', () => {
    const reply = 'First sentence here. Second one is longer than the rest of them. Third.';
    expect(speechText(reply, 40)).toBe('First sentence here.');
  });
  it('does not double up full stops at line breaks', () => {
    expect(speechText('**Hi.**\nNext line\nLast')).toBe('Hi. Next line. Last');
  });
});

describe('speechSentences', () => {
  it('queues each sentence on its own', () => {
    expect(speechSentences('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
  });
  it('splits a run-on sentence at a space', () => {
    const long = 'word '.repeat(100).trim();
    const parts = speechSentences(long, 50);
    expect(parts.every(p => p.length <= 50)).toBe(true);
    expect(parts.join(' ')).toBe(long);
  });
});
