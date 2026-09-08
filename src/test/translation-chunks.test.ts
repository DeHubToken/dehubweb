import { describe, it, expect } from 'vitest';
import { translationChunks } from '../../supabase/functions/translate-text/chunks';

describe('translation segments', () => {
  it.each(['a'.repeat(501), '日本語の文章です。'.repeat(100), '🎬 Trame e recensioni. '.repeat(50)])('preserves all text within UTF-8 limits', text => {
    const chunks = translationChunks(text);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(500);
  });
  it('preserves title boundaries and paragraph whitespace', () => {
    const text = 'Titolo\n\n' + 'Una frase lunga. '.repeat(50) + '\n\nFine.';
    const chunks = translationChunks(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.filter(chunk => chunk === '\n\n')).toHaveLength(2);
  });
});
