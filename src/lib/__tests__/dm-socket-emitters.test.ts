import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A bare socket.io `emit` cannot fail, so a caller that wraps one in try/catch
 * is not actually protected — the catch is unreachable and the action is
 * silently dropped. These pin that the user-initiated emitters reject on a dead
 * socket, which is the only thing that makes the callers' error handling real.
 *
 * The forward case is the sharp one: its success toast fires on the line after
 * the emit, so a dropped forward was reported to the user in green.
 */

type Handler = () => void;

class FakeSocket {
  connected = false;
  active = false;
  emitted: Array<{ event: string; payload: unknown }> = [];
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb: Handler) { this.handlers.get(event)?.delete(cb); return this; }
  emit(event: string, payload: unknown) { this.emitted.push({ event, payload }); return this; }
  onAny() { return this; }
  disconnect() { this.connected = false; return this; }
  connect() { this.active = true; return this; }
  goLive() {
    this.connected = true;
    this.handlers.get('connect')?.forEach((cb) => cb());
  }
}

const socket = new FakeSocket();

vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('@/lib/api/dehub/core', () => ({
  getAuthToken: () => 'Bearer test-token',
  DEHUB_API_BASE: 'https://api.example.test',
  apiCall: vi.fn(),
}));

let emitForwardMessage: (p: { messageId: string; targetDmId: string }) => Promise<void>;
let emitDeleteMessage: (dmId: string, messageId: string) => Promise<void>;

beforeEach(async () => {
  vi.useFakeTimers();
  socket.connected = false;
  socket.active = false;
  socket.emitted = [];
  ({ emitForwardMessage, emitDeleteMessage } = await import('@/lib/api/dehub/dm-socket'));
});

afterEach(() => { vi.useRealTimers(); });

describe('user-initiated DM emitters', () => {
  it('forwards when the socket is up, with the payload intact', async () => {
    socket.connected = true;
    await emitForwardMessage({ messageId: 'm1', targetDmId: 'c9' });
    expect(socket.emitted).toEqual([
      { event: 'forwardMessage', payload: { messageId: 'm1', targetDmId: 'c9' } },
    ]);
  });

  it('rejects a forward on a dead socket instead of reporting success', async () => {
    const pending = emitForwardMessage({ messageId: 'm1', targetDmId: 'c9' });
    const assertion = expect(pending).rejects.toThrow(/not connected/i);
    await vi.advanceTimersByTimeAsync(9000);
    await assertion;
    expect(socket.emitted).toHaveLength(0);
  });

  it('waits for a socket that comes up late rather than failing early', async () => {
    const pending = emitForwardMessage({ messageId: 'm2', targetDmId: 'c1' });
    await vi.advanceTimersByTimeAsync(300);
    socket.goLive();
    await pending;
    expect(socket.emitted.map((e) => e.event)).toEqual(['forwardMessage']);
  });

  it('gates delete too — a message believed removed must not silently survive', async () => {
    const pending = emitDeleteMessage('c1', 'm3');
    const assertion = expect(pending).rejects.toThrow(/not connected/i);
    await vi.advanceTimersByTimeAsync(9000);
    await assertion;
    expect(socket.emitted).toHaveLength(0);
  });
});
