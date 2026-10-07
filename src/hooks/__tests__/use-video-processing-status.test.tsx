import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getNFTInfo: vi.fn() }));
vi.mock('@/lib/api/dehub', () => ({ getNFTInfo: mocks.getNFTInfo }));
import { markVideoProcessing, useVideoProcessingStatus, type VideoProcessingStatus } from '@/hooks/use-video-processing-status';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { client.clear(); vi.useRealTimers(); });

it('clears a stale loader from the server and shares completion across copies', async () => {
  mocks.getNFTInfo.mockResolvedValue({ tokenId: 6475, transcodingStatus: 'done' });
  const { result, unmount } = renderHook(() => [
    useVideoProcessingStatus('6475', 'on', true),
    useVideoProcessingStatus('6475', 'pending', true),
  ], { wrapper });
  await waitFor(() => expect(result.current).toEqual(['done', 'done']));
  expect(mocks.getNFTInfo).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  act(() => vi.advanceTimersByTime(20_000));
  expect(mocks.getNFTInfo).toHaveBeenCalledTimes(1);
  unmount();
});

it('follows pending work until failure and restarts after an accepted retry', async () => {
  mocks.getNFTInfo.mockResolvedValueOnce({ transcodingStatus: 'on' })
    .mockResolvedValueOnce({ transcodingStatus: 'failed' })
    .mockResolvedValue({ transcodingStatus: 'done' });
  const { result, unmount } = renderHook(() => useVideoProcessingStatus('39', 'pending', true), { wrapper });
  await waitFor(() => expect(result.current).toBe('on'));
  await waitFor(() => expect(result.current).toBe('failed'), { timeout: 7_000 });
  act(() => markVideoProcessing(client, 39));
  await waitFor(() => expect(result.current).toBe('done'), { timeout: 7_000 });
  expect(mocks.getNFTInfo).toHaveBeenCalledTimes(3);
  unmount();
}, 20_000);

it('does not fetch hidden, completed, legacy or backgrounded videos', () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  const { unmount } = renderHook(() => [
    useVideoProcessingStatus('1', 'pending', true),
    useVideoProcessingStatus('2', 'on', false),
    useVideoProcessingStatus('3', 'done', true),
    useVideoProcessingStatus('4', undefined, true),
  ], { wrapper });
  expect(mocks.getNFTInfo).not.toHaveBeenCalled();
  unmount();
});

it('does not carry a late completion onto another post or clear a missing status', async () => {
  let finish!: (value: unknown) => void;
  mocks.getNFTInfo.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({});
  const { result, rerender, unmount } = renderHook(
    ({ id, status }: { id: string; status: VideoProcessingStatus }) => useVideoProcessingStatus(id, status, true),
    { wrapper, initialProps: { id: '1', status: 'pending' as VideoProcessingStatus } },
  );
  rerender({ id: '2', status: 'pending' });
  await act(async () => finish({ transcodingStatus: 'done' }));
  await waitFor(() => expect(mocks.getNFTInfo).toHaveBeenCalledTimes(2));
  expect(result.current).toBe('pending');
  unmount();
});
