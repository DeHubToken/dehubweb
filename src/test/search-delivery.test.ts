import { beforeEach, expect, it, vi } from 'vitest';
import { universalSearch } from '@/lib/api/dehub/feed';
import { apiCall } from '@/lib/api/dehub/core';
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: vi.fn(), getAuthToken: () => null }));
beforeEach(() => { vi.mocked(apiCall).mockReset(); vi.mocked(apiCall).mockResolvedValue({ content: { items: [], pagination: {} } }); });
it('maps successive client pages to distinct server pages', async () => {
  for (const page of [0, 1, 2]) await universalSearch({ q: 'music', page, type: 'videos' });
  expect(vi.mocked(apiCall).mock.calls.map(([, options]) => options?.params?.page)).toEqual([1, 2, 3]);
});
it('requests content without redundant people work, keeping account and combined modes', async () => {
  for (const type of ['videos', 'accounts', undefined] as const) await universalSearch({ q: 'music', type });
  expect(vi.mocked(apiCall).mock.calls.map(([, options]) => options?.params?.type)).toEqual(['content', 'accounts', undefined]);
});
