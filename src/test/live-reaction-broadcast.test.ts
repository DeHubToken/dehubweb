import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data?: unknown) => void>>();
  const socket = {
    connected: true,
    on: vi.fn((name: string, fn: (data?: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    }),
    off: vi.fn((name: string, fn: (data?: unknown) => void) => listeners.get(name)?.delete(fn)),
    emit: vi.fn(), disconnect: vi.fn(),
  };
  return { listeners, socket, token: 'viewer-token' as string | null };
});
vi.mock('socket.io-client', () => ({ io: () => mock.socket }));
vi.mock('@/lib/api/dehub/core', () => ({ DEHUB_API_BASE: 'https://example.test', getAuthToken: () => mock.token }));
import { sendStreamReaction, watchStreamReactions } from '@/lib/api/dehub/stream-presence';

describe('live room reaction transport', () => {
  beforeEach(() => { vi.clearAllMocks(); mock.listeners.clear(); mock.socket.connected = true; mock.token = 'viewer-token'; });
  it('delivers one authoritative echo only to the matching room', () => {
    const receiveA = vi.fn();
    const receiveB = vi.fn();
    const a = watchStreamReactions('room-a', receiveA);
    const b = watchStreamReactions('room-b', receiveB);
    sendStreamReaction('room-a', 'love');
    expect(mock.socket.emit).toHaveBeenCalledWith('stream.reaction', { streamId: 'room-a', reactionType: 'HEART' });
    expect(receiveA).not.toHaveBeenCalled();
    mock.listeners.get('stream.reaction')!.forEach(fn => fn({ streamId: 'room-a', reactionType: 'HEART', weight: 14 }));
    expect(receiveA).toHaveBeenCalledExactlyOnceWith({ reactionType: 'HEART', weight: 14 });
    expect(receiveB).not.toHaveBeenCalled();
    a.leave(); b.leave();
    expect(mock.listeners.get('stream.reaction')!.size).toBe(0);
    expect(mock.socket.disconnect).toHaveBeenCalledTimes(1);
  });
  it('rejoins on reconnect and never buffers clicks while disconnected or signed out', () => {
    const sub = watchStreamReactions('room-a', vi.fn());
    mock.socket.emit.mockClear();
    mock.socket.connected = false;
    sendStreamReaction('room-a', 'like');
    expect(mock.socket.emit).not.toHaveBeenCalled();
    mock.socket.connected = true;
    mock.listeners.get('connect')!.forEach(fn => fn());
    expect(mock.socket.emit).toHaveBeenCalledWith('stream.join.room', { streamId: 'room-a' });
    mock.socket.emit.mockClear();
    mock.token = null;
    sendStreamReaction('room-a', 'like');
    expect(mock.socket.emit).not.toHaveBeenCalled();
    sub.leave();
  });
});
