import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Two ways the live "watching" number could go quietly wrong, both on the one
 * screen the number exists for.
 *
 * The socket is shared by every stream a tab has open, and its handshake
 * carries the session token — so a rotated token needs a new one. Rebuilding it
 * used to close the old socket outright, while the presences that opened before
 * the rotation still held it: those viewers stopped being counted, their number
 * froze, and their `leave` hit a dead socket. A manual `disconnect()` also
 * cancels reconnection, so nothing came back. It is retired instead now, and
 * closes when its last holder leaves.
 *
 * The second is cross-talk. One socket carries every stream's updates, so a
 * handler that reads `viewerCount` without checking which stream it belongs to
 * will happily paint another broadcast's audience over its own.
 */

type Handler = (payload?: unknown) => void;

class FakeSocket {
  connected = true;
  disconnected = false;
  emitted: Array<{ event: string; payload: unknown }> = [];
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
    return this;
  }
  off(event: string, cb: Handler) { this.handlers.get(event)?.delete(cb); return this; }
  emit(event: string, payload: unknown) { this.emitted.push({ event, payload }); return this; }
  disconnect() { this.disconnected = true; this.connected = false; return this; }

  /** Deliver a server event to whoever is listening. */
  deliver(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((cb) => cb(payload));
  }
}

let sockets: FakeSocket[] = [];
let token: string | null = 'token-a';

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));
vi.mock('@/lib/api/dehub/core', () => ({
  get getAuthToken() { return () => token; },
  DEHUB_API_BASE: 'https://api.example.test',
}));

async function loadModule() {
  vi.resetModules();
  return import('@/lib/api/dehub/stream-presence');
}

describe('stream presence socket', () => {
  beforeEach(() => {
    sockets = [];
    token = 'token-a';
  });

  it('does not close a socket another viewer is still holding when the token rotates', async () => {
    const { joinStreamPresence, watchStreamPresence } = await loadModule();

    const first = joinStreamPresence('stream-1');
    expect(sockets).toHaveLength(1);

    // A refresh rotates the session token while the first viewer is watching.
    token = 'token-b';
    watchStreamPresence('stream-2', () => undefined);

    expect(sockets).toHaveLength(2);
    expect(sockets[0].disconnected).toBe(false);

    // And the one still in use keeps working: its leave reaches the server.
    first.leave();
    expect(sockets[0].emitted.some((e) => e.event === 'stream.left')).toBe(true);
  });

  it('closes a socket once its last viewer leaves', async () => {
    const { joinStreamPresence } = await loadModule();

    const a = joinStreamPresence('stream-1');
    const b = joinStreamPresence('stream-1');
    expect(sockets).toHaveLength(1);

    a.leave();
    expect(sockets[0].disconnected).toBe(false);

    b.leave();
    expect(sockets[0].disconnected).toBe(true);
  });

  it('ignores a count that belongs to another stream', async () => {
    const { joinStreamPresence } = await loadModule();

    const counts: number[] = [];
    joinStreamPresence('stream-1', (n) => counts.push(n));

    sockets[0].deliver('stream.viewers.update', { streamId: 'stream-2', viewerCount: 99 });
    expect(counts).toEqual([]);

    sockets[0].deliver('stream.viewers.update', { streamId: 'stream-1', viewerCount: 4 });
    expect(counts).toEqual([4]);

    // The gateway does not always name the stream. Dropping those would throw
    // away the only number some surfaces ever receive.
    sockets[0].deliver('stream.viewers.update', { viewerCount: 5 });
    expect(counts).toEqual([4, 5]);
  });
});
