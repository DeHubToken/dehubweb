import { describe, expect, it, vi } from 'vitest';
import { useBrowseListings } from '../use-stores';

const { builder } = vi.hoisted(() => {
  const builder: any = {};
  for (const method of ['select', 'eq', 'ilike', 'order', 'range']) builder[method] = vi.fn(() => builder);
  builder.abortSignal = vi.fn(async () => ({ data: [{ id: '51' }], error: null }));
  return { builder };
});
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: (options: any) => options, keepPreviousData: (data: any) => data }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => builder } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('@/lib/supabase-wallet-client', () => ({ withWalletHeader: (query: any) => query }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (_key: string, options: any) => options.defaultValue }));

describe('store browse pagination', () => {
  it('can request listing 51 and keeps equal-price results in deterministic order', async () => {
    const options = useBrowseListings('art', 'price_asc', 'print') as any;
    const signal = new AbortController().signal;
    const result = await options.queryFn({ pageParam: 50, signal });
    expect(builder.range).toHaveBeenCalledWith(50, 99);
    expect(builder.order.mock.calls.slice(-2)).toEqual([['price', { ascending: true }], ['id', { ascending: true }]]);
    expect(builder.abortSignal).toHaveBeenCalledWith(signal);
    expect(result).toEqual([{ id: '51' }]);
    expect(options.getNextPageParam(Array(50).fill({}), [[], []])).toBe(100);
    expect(options.getNextPageParam([{ id: '51' }], [[], []])).toBeUndefined();
  });
});
