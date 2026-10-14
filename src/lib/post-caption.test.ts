import { describe, expect, it } from 'vitest';
import { displayPostTitle } from './post-caption';

describe('displayPostTitle', () => {
  it('does not repeat a caption copied into a media title', () => {
    expect(displayPostTitle('Coffee beside an open book. The dangerous part is', 'Coffee beside an open book. The dangerous part is pretending I will stop at one chapter.')).toBe('');
  });

  it('preserves a distinct title and a title without a description', () => {
    expect(displayPostTitle('Garden notes', 'Basil grows well here.')).toBe('Garden notes');
    expect(displayPostTitle('Garden notes', undefined)).toBe('Garden notes');
  });
});
