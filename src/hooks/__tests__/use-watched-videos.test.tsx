import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ getWatchHistory: vi.fn() }));
vi.mock('@/lib/api/dehub', () => ({ getWatchHistory: mocks.getWatchHistory }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, walletAddress: '0xALICE' }),
}));
vi.mock('@/contexts/UserPreferencesContext', () => ({ useSyncedPreference: () => ({ push: vi.fn() }) }));

import { useIsWatchedVideo } from '@/hooks/use-watched-videos';

beforeEach(() => vi.clearAllMocks());

it('keeps watched markers after a JSON cache restore and ignores old Set-shaped data', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['watched-video-ids', '0xalice'], JSON.parse(JSON.stringify(new Set(['39']))));
  mocks.getWatchHistory.mockResolvedValue({ result: [{ tokenId: 39 }, { tokenId: 39 }] });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
  const first = renderHook(() => useIsWatchedVideo('39'), { wrapper });
  await waitFor(() => expect(first.result.current).toBe(true));
  expect(client.getQueryData(['watched-video-ids', '0xalice', 2])).toEqual(['39']);

  const saved = JSON.parse(JSON.stringify(dehydrate(client)));
  first.unmount();
  client.clear();
  const restored = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  hydrate(restored, saved);
  const restoredWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: restored }, children);
  const second = renderHook(() => [useIsWatchedVideo('39'), useIsWatchedVideo('40')], { wrapper: restoredWrapper });
  expect(second.result.current).toEqual([true, false]);
  expect(mocks.getWatchHistory).toHaveBeenCalledTimes(1);
  second.unmount();
  restored.clear();
});
