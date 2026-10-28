import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { getAccountInfo } from '@/lib/api/dehub';
vi.mock('@/lib/api/dehub', () => ({ getAccountInfo: vi.fn(), getAccountSummaries: vi.fn() }));
vi.mock('@/lib/media-url', () => ({ extractAvatarPath: (u: any) => u.avatarImageUrl, buildAvatarUrl: (_address: string, path: string) => path }));
afterEach(cleanup);
it('retries a temporary failure while preserving the visible fallback', async () => {
  vi.mocked(getAccountInfo).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ address: 'a', avatarImageUrl: 'real.png' } as any);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client, children });
  const hook = renderHook(() => useProfileAvatar('a', 'fallback.png'), { wrapper });
  expect(hook.result.current).toBe('fallback.png');
  await waitFor(() => expect(hook.result.current).toBe('real.png'));
  expect(getAccountInfo).toHaveBeenCalledTimes(2);
  hook.unmount(); client.clear();
});
