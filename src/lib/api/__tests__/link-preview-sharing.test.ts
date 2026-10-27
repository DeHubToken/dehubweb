import { describe, it, expect, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { fetchLinkPreview } from '../link-preview';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('../../predictions', () => ({ parsePredictionLink: () => null }));
vi.mock('../../rich-links', () => ({ parseRichLink: () => null }));
const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
describe('preview request sharing', () => {
  it('shares concurrent requests and caches successful metadata', async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const url = 'https://example.com/concurrent';
    const a = fetchLinkPreview(url), b = fetchLinkPreview(url);
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve({ data: { title: 'Article' }, error: null });
    expect(await a).toEqual(await b);
    expect((await fetchLinkPreview(url))?.title).toBe('Article');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('does not cache failure fallbacks, so the next request can recover', async () => {
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const url = 'https://example.com/retry';
    expect((await fetchLinkPreview(url))?.title).toBe('example.com');
    invoke.mockResolvedValueOnce({ data: { title: 'Recovered' }, error: null });
    expect((await fetchLinkPreview(url))?.title).toBe('Recovered');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
