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

async function loadControl() {
  vi.resetModules();
  return import('@/lib/api/dehub/overlay-control');
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
    expect(sockets[0].emitted.filter(e => e.event === 'stream.join')).toHaveLength(1);
    expect(sockets[0].emitted.filter(e => e.event === 'stream.left')).toHaveLength(0);

    b.leave();
    expect(sockets[0].disconnected).toBe(true);
    expect(sockets[0].emitted.filter(e => e.event === 'stream.left')).toHaveLength(1);
  });

  it('ignores a count that belongs to another stream', async () => {
    const { joinStreamPresence } = await loadModule();

    const counts: number[] = [];
    joinStreamPresence('stream-1', (n) => counts.push(n));

    sockets[0].deliver('stream.viewers.update', { streamId: 'stream-2', viewerCount: 99 });
    expect(counts).toEqual([]);

    sockets[0].deliver('stream.viewers.update', { streamId: 'stream-1', viewerCount: 4 });
    expect(counts).toEqual([4]);

    // An unscoped update could belong to any mounted stream card.
    sockets[0].deliver('stream.viewers.update', { viewerCount: 5 });
    expect(counts).toEqual([4]);
  });
});

/**
 * Gifts arrive in a different shape from every other room event: the gateway
 * sends `{ gift: <activity row> }`, with the stream id on the row. Filtering
 * them like a count — top-level `streamId` or nothing — dropped all of them.
 */
describe('stream gift broadcasts', () => {
  beforeEach(() => {
    sockets = [];
    token = 'token-a';
  });

  /** What the gateway actually emits for a recorded gift. */
  const tipFor = (streamId: string, amount = 250000) => ({
    gift: {
      _id: 'activity-1',
      streamId,
      status: 'TIP',
      address: '0xfa00000000000000000000000000000000000002',
      meta: {
        amount,
        username: 'fan',
        message: 'gm',
        selectedTier: 'Crown',
        address: '0xFA00000000000000000000000000000000000002',
        transactionHash: '0xABC',
      },
    },
  });

  it('plays a gift sent to the stream being watched', async () => {
    const { watchStreamGifts } = await loadModule();
    const gifts: unknown[] = [];
    watchStreamGifts('stream-1', (g) => gifts.push(g));

    sockets[0].deliver('streamer.tip', tipFor('stream-1'));
    expect(gifts).toEqual([
      {
        amount: 250000,
        selectedTier: 'Crown',
        username: 'fan',
        message: 'gm',
        address: '0xfa00000000000000000000000000000000000002',
        transactionHash: '0xabc',
      },
    ]);
  });

  it('ignores a gift sent to another stream on the same socket', async () => {
    const { watchStreamGifts } = await loadModule();
    const gifts: unknown[] = [];
    watchStreamGifts('stream-1', (g) => gifts.push(g));

    sockets[0].deliver('streamer.tip', tipFor('stream-2'));
    expect(gifts).toEqual([]);
  });

  it('ignores a gift that names no stream at all', async () => {
    const { watchStreamGifts } = await loadModule();
    const gifts: unknown[] = [];
    watchStreamGifts('stream-1', (g) => gifts.push(g));

    sockets[0].deliver('streamer.tip', { gift: { meta: { amount: 10 } } });
    expect(gifts).toEqual([]);
  });

  it('also reads a stream id sent beside the gift', async () => {
    const { watchStreamGifts } = await loadModule();
    const gifts: unknown[] = [];
    watchStreamGifts('stream-1', (g) => gifts.push(g));

    sockets[0].deliver('streamer.tip', { streamId: 'stream-1', gift: { meta: { amount: 10 } } });
    expect(gifts).toHaveLength(1);
  });

  /** The message is read aloud off this one, so a forged tip cannot be. */
  it('hands over a paid tip separately, with the paid amount and its message', async () => {
    const { watchStreamGifts } = await loadModule();
    const gifts: unknown[] = [];
    const paid: unknown[] = [];
    watchStreamGifts('stream-1', (g) => gifts.push(g), (p) => paid.push(p));

    const confirmed = {
      streamId: 'stream-1',
      transactionHash: '0xABC',
      address: '0xFA00000000000000000000000000000000000002',
      paidAmount: 250,
      claimedAmount: 250000,
      message: 'gm',
    };
    sockets[0].deliver('streamer.tip.confirmed', confirmed);
    sockets[0].deliver('streamer.tip.confirmed', { ...confirmed, streamId: 'stream-2' });
    sockets[0].deliver('streamer.tip.confirmed', { ...confirmed, paidAmount: 0 });
    sockets[0].deliver('streamer.tip.confirmed', { ...confirmed, message: '   ' });

    expect(gifts).toEqual([]);
    expect(paid).toEqual([
      {
        paidAmount: 250,
        message: 'gm',
        address: '0xfa00000000000000000000000000000000000002',
        transactionHash: '0xabc',
      },
      {
        paidAmount: 250,
        message: undefined,
        address: '0xfa00000000000000000000000000000000000002',
        transactionHash: '0xabc',
      },
    ]);
  });

  it('stops hearing paid tips when it leaves', async () => {
    const { watchStreamGifts } = await loadModule();
    const paid: unknown[] = [];
    const sub = watchStreamGifts('stream-1', () => undefined, (p) => paid.push(p));
    sub.leave();
    sockets[0].deliver('streamer.tip.confirmed', { streamId: 'stream-1', paidAmount: 5 });
    expect(paid).toEqual([]);
  });
});

/**
 * The overlay hears the whole room through one watcher. Money has two events:
 * the instant tip, at the amount the sender typed, and the confirmation, at
 * the amount the chain paid — and a widget that counts must only see the
 * second.
 */
describe('live room events for the overlay', () => {
  beforeEach(() => {
    sockets = [];
    token = 'token-a';
  });

  async function watch(streamId = 'stream-1') {
    const { watchLiveRoomEvents } = await loadModule();
    const events: unknown[] = [];
    const sub = watchLiveRoomEvents(streamId, (e) => events.push(e));
    return { events, sub, socket: sockets[0] };
  }

  it('joins the room without counting itself as a viewer', async () => {
    const { socket } = await watch();
    expect(socket.emitted).toEqual([{ event: 'stream.join.room', payload: { streamId: 'stream-1' } }]);
  });

  it('keeps the claimed tip and the paid confirmation apart', async () => {
    const { events, socket } = await watch();
    socket.deliver('streamer.tip', {
      streamId: 'stream-1',
      gift: { meta: { amount: 10000, username: 'fan', address: '0xFAN', transactionHash: '0xHASH' } },
    });
    socket.deliver('streamer.tip.confirmed', {
      streamId: 'stream-1',
      paidAmount: 1,
      claimedAmount: 10000,
      address: '0xFAN',
      transactionHash: '0xHASH',
    });
    expect(events).toEqual([
      {
        type: 'tip',
        amount: 10000,
        selectedTier: undefined,
        user: { address: '0xfan', username: 'fan', displayName: undefined, avatarImageUrl: undefined },
        message: undefined,
        transactionHash: '0xhash',
      },
      { type: 'tipConfirmed', paidAmount: 1, address: '0xfan', transactionHash: '0xhash' },
    ]);
  });

  it('names the sender of a paid tip when the confirmation carries them', async () => {
    const { events, socket } = await watch();
    socket.deliver('streamer.tip.confirmed', {
      streamId: 'stream-1',
      paidAmount: 250,
      address: '0xFAN',
      transactionHash: '0xHASH',
      selectedTier: 'Crown',
      message: 'gm',
      user: { address: '0xFAN', username: 'fan' },
    });
    expect(events).toEqual([
      {
        type: 'tipConfirmed',
        paidAmount: 250,
        address: '0xfan',
        transactionHash: '0xhash',
        selectedTier: 'Crown',
        message: 'gm',
        user: { address: '0xfan', username: 'fan', displayName: undefined, avatarImageUrl: undefined },
      },
    ]);
  });

  it('passes reactions on with who sent them', async () => {
    const { events, socket } = await watch();
    socket.deliver('stream.reaction', { streamId: 'stream-1', reactionType: 'HEART', user: { address: '0xA' } });
    socket.deliver('stream.reaction', { streamId: 'stream-2', reactionType: 'HEART', user: { address: '0xB' } });
    socket.deliver('stream.reaction', { streamId: 'stream-1' });
    expect(events).toEqual([{ type: 'reaction', reactionType: 'HEART', user: expect.objectContaining({ address: '0xa' }) }]);
  });

  it('turns follows, subscriptions and shares into people', async () => {
    const { events, socket } = await watch();
    const user = { address: '0xA', username: 'ann' };
    socket.deliver('stream.follow', { streamId: 'stream-1', user });
    socket.deliver('stream.subscribe', { streamId: 'stream-1', user, planName: 'Gold' });
    socket.deliver('stream.share', { streamId: 'stream-1', user });
    expect(events.map((e: any) => [e.type, e.user.username, e.planName])).toEqual([
      ['follow', 'ann', undefined],
      ['subscribe', 'ann', 'Gold'],
      ['share', 'ann', undefined],
    ]);
  });

  it('reports joins with a face, and the count that came with them', async () => {
    const { events, socket } = await watch();
    socket.deliver('stream.join', { streamId: 'stream-1', viewerCount: 7, user: { address: '0xB' } });
    expect(events).toEqual([
      { type: 'join', user: { address: '0xb', username: undefined, displayName: undefined, avatarImageUrl: undefined } },
      { type: 'viewers', count: 7 },
    ]);
  });

  it('passes on an overlay change so viewers redraw', async () => {
    const { events, socket } = await watch();
    socket.deliver('stream.overlay.updated', { streamId: 'stream-1', version: 5, renderIn: 'app' });
    expect(events).toEqual([{ type: 'overlayUpdated', version: 5 }]);
  });

  it('ignores every event meant for another stream', async () => {
    const { events, socket } = await watch();
    socket.deliver('stream.follow', { streamId: 'stream-2', user: { address: '0xA' } });
    socket.deliver('streamer.tip.confirmed', { streamId: 'stream-2', paidAmount: 5 });
    socket.deliver('streamer.tip', { gift: { streamId: 'stream-2', meta: { amount: 5 } } });
    socket.deliver('stream.viewers.update', { streamId: 'stream-2', viewerCount: 9 });
    expect(events).toEqual([]);
  });

  it('stops listening when it leaves', async () => {
    const { events, socket, sub } = await watch();
    sub.leave();
    socket.deliver('stream.follow', { streamId: 'stream-1', user: { address: '0xA' } });
    expect(events).toEqual([]);
    expect(socket.disconnected).toBe(true);
  });
});

/**
 * Live Studio and the OBS page listen on the creator's control room. A test
 * alert arrives there and nowhere else, already shaped like the room events a
 * widget reads.
 */
describe('overlay control room', () => {
  beforeEach(() => {
    sockets = [];
    token = 'token-a';
  });

  it('joins with its token and says what kind of surface it is', async () => {
    const { watchOverlayControl } = await loadControl();
    watchOverlayControl('A'.repeat(24), 'studio', {});
    expect(sockets[0].emitted).toEqual([{ event: 'overlay.join', payload: { token: 'A'.repeat(24), surface: 'studio' } }]);
  });

  it('turns a test tip into both the tip and its confirmation', async () => {
    const { watchOverlayControl } = await loadControl();
    const batches: unknown[] = [];
    watchOverlayControl('A'.repeat(24), 'studio', { onTest: (events) => batches.push(events) });
    sockets[0].deliver('overlay.test', { kind: 'tip', test: true, at: 'now', amount: 250000, message: 'hi', user: { address: '0xC' } });
    const [events] = batches as any[];
    expect(events.map((e: any) => e.type)).toEqual(['tip', 'tipConfirmed']);
    expect(events[0]).toMatchObject({ amount: 250000, message: 'hi', transactionHash: 'test-now' });
    expect(events[1]).toMatchObject({ paidAmount: 250000, transactionHash: 'test-now' });
  });

  it('passes a test follow through as a follow', async () => {
    const { watchOverlayControl } = await loadControl();
    const batches: any[] = [];
    watchOverlayControl('A'.repeat(24), 'studio', { onTest: (events) => batches.push(events) });
    sockets[0].deliver('overlay.test', { kind: 'follow', user: { address: '0xD', username: 'dee' } });
    expect(batches[0]).toMatchObject([{ type: 'follow', user: { username: 'dee' } }]);
  });

  it('leaves the room when it is done', async () => {
    const { watchOverlayControl } = await loadControl();
    const sub = watchOverlayControl('A'.repeat(24), 'studio', {});
    sub.leave();
    expect(sockets[0].emitted.at(-1)).toEqual({ event: 'overlay.leave', payload: { token: 'A'.repeat(24) } });
  });
});
