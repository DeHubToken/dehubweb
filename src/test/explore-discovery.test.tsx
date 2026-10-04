import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiscoveryTab, type DiscoveryTab } from '@/hooks/use-discovery-tab';
import { useFollowStatus, useFollowStatuses } from '@/hooks/use-follow-status';
import { mapUserToSearchCreator } from '@/hooks/use-dehub-user-search';

const auth = vi.hoisted(() => ({ walletAddress: '0xViewerA' as string | null }));
const api = vi.hoisted(() => ({ getFollowStatus: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api/dehub', () => api);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => {
  auth.walletAddress = '0xViewerA';
  api.getFollowStatus.mockReset().mockResolvedValue({ isFollowing: true, isFollowRequestPending: false });
});

describe('Explore discovery categories', () => {
  it('keeps both panels different for every selection and after remount', () => {
    const hook = renderHook(() => ({ sidebar: useDiscoveryTab('sidebar'), explore: useDiscoveryTab('explore') }));
    const tabs: DiscoveryTab[] = ['posts', 'stages', 'tickers'];
    expect(hook.result.current.sidebar[0]).not.toBe(hook.result.current.explore[0]);
    for (const panel of ['sidebar', 'explore'] as const) {
      for (const tab of tabs) {
        act(() => hook.result.current[panel][1](tab));
        expect(hook.result.current[panel][0]).toBe(tab);
        expect(hook.result.current.sidebar[0]).not.toBe(hook.result.current.explore[0]);
      }
    }
    const previous = [hook.result.current.sidebar[0], hook.result.current.explore[0]];
    hook.unmount();
    const restored = renderHook(() => [useDiscoveryTab('sidebar')[0], useDiscoveryTab('explore')[0]]);
    expect(restored.result.current).toEqual(previous);
  });
});

describe('Explore follow relationships', () => {
  it('uses the wallet identity and preserves relationship fields in exact results', () => {
    const result = mapUserToSearchCreator({ _id: 'profile-id', address: '0xTarget', username: 'person', isFollowing: true, followsYou: true });
    expect(result).toMatchObject({ id: '0xTarget', isFollowing: true, followsYou: true });
  });

  it('shares remembered status between the roster and search and separates viewers', async () => {
    const { wrapper } = setup();
    const roster = renderHook(() => useFollowStatuses(['0xTarget']), { wrapper });
    await waitFor(() => expect(roster.result.current['0xtarget']?.isFollowing).toBe(true));
    const search = renderHook(() => useFollowStatus('0xTarget'), { wrapper });
    await waitFor(() => expect(search.result.current.data?.isFollowing).toBe(true));
    expect(api.getFollowStatus).toHaveBeenCalledTimes(1);
    api.getFollowStatus.mockResolvedValue({ isFollowing: false, isFollowRequestPending: false });
    auth.walletAddress = '0xViewerB';
    search.rerender();
    expect(search.result.current.data).toBeUndefined();
    await waitFor(() => expect(search.result.current.data?.isFollowing).toBe(false));
  });

  it('limits a roster to four simultaneous checks', async () => {
    let inFlight = 0;
    let peak = 0;
    api.getFollowStatus.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return { isFollowing: true, isFollowRequestPending: false };
    });
    const { wrapper } = setup();
    const hook = renderHook(() => useFollowStatuses(Array.from({ length: 15 }, (_, i) => `0x${i}`)), { wrapper });
    await waitFor(() => expect(Object.values(hook.result.current).filter(Boolean)).toHaveLength(15));
    expect(peak).toBe(4);
  });
});
