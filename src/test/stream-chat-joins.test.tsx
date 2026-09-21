import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStreamChatJoins } from '@/hooks/use-stream-chat-joins';

const mock = vi.hoisted(() => ({ fetch: vi.fn(), watch: vi.fn(), watchGifts: vi.fn(), leave: vi.fn() }));
vi.mock('@/lib/api/dehub/livestream', () => ({ getStreamActivities: mock.fetch }));
vi.mock('@/lib/api/dehub/stream-presence', () => ({ watchStreamJoins: mock.watch, watchStreamGifts: mock.watchGifts }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('stream chat arrivals', () => {
  it('keeps the first arrival per viewer across history and reconnects', async () => {
    mock.fetch.mockResolvedValue({ result: [{ id: 'old', type: 'join', address: 'a', timestamp: '2026-01-01T00:00:00Z' }] });
    mock.watch.mockReturnValue({ leave: mock.leave });
    mock.watchGifts.mockReturnValue({ leave: mock.leave });
    const { result, unmount } = renderHook(() => useStreamChatJoins('stream-a'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    act(() => mock.watch.mock.calls[0][1]({ address: 'a', username: 'Alice' }));
    act(() => mock.watch.mock.calls[0][1]({ address: 'A', username: 'Alice returned' }));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('old');
    act(() => mock.watch.mock.calls[0][1]({ address: 'b', username: 'Bob' }));
    expect(result.current).toHaveLength(2);
    unmount();
    expect(mock.leave).toHaveBeenCalledTimes(2);
  });

  it('shows every gift, recorded or live, with the sender and amount', async () => {
    mock.fetch.mockResolvedValue({ result: [
      { id: 'j', type: 'join', address: 'a', timestamp: '2026-01-01T00:00:00Z' },
      { id: 'g', type: 'gift', address: 'a', username: 'Alice', giftAmount: 1000, giftCurrency: 'DHB', timestamp: '2026-01-01T00:01:00Z' },
    ] });
    mock.watch.mockReturnValue({ leave: mock.leave });
    mock.watchGifts.mockReturnValue({ leave: mock.leave });
    const { result } = renderHook(() => useStreamChatJoins('stream-a'));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((m) => m.type)).toEqual(['join', 'gift']);
    act(() => mock.watchGifts.mock.calls[0][1]({ amount: 50, address: 'b', username: 'Bob', message: 'gg', transactionHash: '0xdead' }));
    expect(result.current).toHaveLength(3);
    expect(result.current[2]).toMatchObject({ type: 'gift', giftAmount: 50, username: 'Bob', message: 'gg', id: 'gift:0xdead' });
    // A join from the same sender right after does not swallow the gift.
    act(() => mock.watch.mock.calls[0][1]({ address: 'a', username: 'Alice', avatarImageUrl: 'avatars/a.jpg' }));
    expect(result.current).toHaveLength(3);
  });

  it('loads replay history without subscribing and clears it when switching streams', async () => {
    mock.fetch.mockResolvedValue({ result: [{ id: 'old', type: 'join', address: 'a', timestamp: '2026-01-01T00:00:00Z' }] });
    const { result, rerender } = renderHook(({ id }) => useStreamChatJoins(id, true), { initialProps: { id: 'a' } });
    await waitFor(() => expect(result.current).toHaveLength(1));
    mock.fetch.mockReturnValue(new Promise(() => {}));
    rerender({ id: 'b' });
    expect(result.current).toEqual([]);
    expect(mock.watch).not.toHaveBeenCalled();
  });
});
