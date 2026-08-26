import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * `emit` on a disconnected socket.io client does not throw — it buffers into
 * memory that only survives if THIS page later reconnects. And the DM socket
 * gives up permanently after `reconnectionAttempts`, which a phone that sleeps
 * or changes network reaches easily; past that point every emit is a no-op
 * forever, with nothing raised anywhere.
 *
 * So the guarantee worth pinning is narrow: waitForDmSocket must reject rather
 * than resolve when the socket is not up, because that rejection is the only
 * thing that makes the send mutation's rollback and toast reachable at all.
 */

type Handler = () => void;

class FakeSocket {
  connected = false;
  active = false;
  connectCalls = 0;
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb: Handler) {
    this.handlers.get(event)?.delete(cb);
    return this;
  }
  emit() { return this; }
  onAny() { return this; }
  disconnect() { this.connected = false; return this; }
  connect() {
    this.connectCalls += 1;
    this.active = true;
    return this;
  }
  /** Test helper: the server accepted the connection. */
  goLive() {
    this.connected = true;
    this.handlers.get('connect')?.forEach((cb) => cb());
  }
  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }
}

const socket = new FakeSocket();

vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('@/lib/api/dehub/core', () => ({
  getAuthToken: () => 'Bearer test-token',
  DEHUB_API_BASE: 'https://api.example.test',
  apiCall: vi.fn(),
}));

let waitForDmSocket: (timeoutMs?: number) => Promise<void>;

beforeEach(async () => {
  vi.useFakeTimers();
  socket.connected = false;
  socket.active = false;
  socket.connectCalls = 0;
  ({ waitForDmSocket } = await import('@/lib/api/dehub/dm-socket'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForDmSocket', () => {
  it('resolves immediately when the socket is already up', async () => {
    socket.connected = true;
    await expect(waitForDmSocket()).resolves.toBeUndefined();
  });

  it('rejects when the socket never connects — this is what surfaces a lost send', async () => {
    const pending = waitForDmSocket(5000);
    const assertion = expect(pending).rejects.toThrow(/not connected/i);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });

  it('resolves once the socket comes up inside the window', async () => {
    const pending = waitForDmSocket(5000);
    await vi.advanceTimersByTimeAsync(500);
    socket.goLive();
    await expect(pending).resolves.toBeUndefined();
  });

  it('re-arms a client that has given up, since nothing else ever will', async () => {
    socket.active = false;
    const pending = waitForDmSocket(5000);
    expect(socket.connectCalls).toBe(1);
    socket.goLive();
    await pending;
  });

  it('does not fight a reconnect already in flight', async () => {
    socket.active = true;
    const pending = waitForDmSocket(5000);
    expect(socket.connectCalls).toBe(0);
    socket.goLive();
    await pending;
  });

  it('leaves no listener behind on either outcome', async () => {
    const before = socket.listenerCount('connect');

    const ok = waitForDmSocket(5000);
    socket.goLive();
    await ok;
    expect(socket.listenerCount('connect')).toBe(before);

    socket.connected = false;
    const failed = waitForDmSocket(5000);
    const assertion = expect(failed).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
    expect(socket.listenerCount('connect')).toBe(before);
  });
});
