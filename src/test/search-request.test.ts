import { describe, expect, it } from 'vitest';
import { searchRequestDraft, searchRequestFields } from '@/lib/search-request';

const t = ((_key: string, fallback: string, options?: Record<string, unknown>) =>
  fallback.replace('{{query}}', String(options?.query ?? ''))) as never;

describe('search request', () => {
  it('fills the box from what was searched', () => {
    expect(searchRequestDraft('  watch   to earn ', 'menu', t)).toBe('Add watch to earn to Riftn');
    expect(searchRequestDraft('dark mode schedule', 'settings', t)).toBe('A setting for dark mode schedule');
  });

  it('keeps the title under the board limit and says where it came from', () => {
    const long = 'x'.repeat(140);
    const fields = searchRequestFields(long, 'karaoke', 'menu');
    expect(fields.title.length).toBe(100);
    expect(fields.description).toContain('Searched the menu search for "karaoke"');
    expect(searchRequestFields('A setting for y', 'y', 'settings').description).toContain('Settings search');
  });
});
