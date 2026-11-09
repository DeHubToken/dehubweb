import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
const made: FakeSocket[] = [];
class FakeSocket {
  connected = true;
  active = true;
  auth: unknown;
  handlers: Record<string, Handler[]> = {};
  engineClose = vi.fn();
  io = { opts: { query: {} as unknown }, engine: { close: this.engineClose } };
  disconnect = vi.fn(() => { this.connected = false; this.active = false; });
  connect = vi.fn();
  emit = vi.fn();
  constructor(opts: { auth: unknown }) { this.auth = opts.auth; }
  on(e: string, fn: Handler) { (this.handlers[e] ||= []).push(fn); return this; }
  off() { return this; }
  onAny() { return this; }
  offAny() { return this; }
}
vi.mock('socket.io-client', () => ({ io: (_url: string, opts: { auth: unknown }) => { const s = new FakeSocket(opts); made.push(s); return s; } }));

const jwt = (address: string) => `h.${btoa(JSON.stringify({ address }))}.s`;

/** What the connection hands the server on its next (re)connect. */
const handshake = (s: FakeSocket) => new Promise((resolve) => (s.auth as (cb: (d: unknown) => void) => void)(resolve));
const signIn = (token: string) => {
  localStorage.setItem('dehub_token', token);
  localStorage.setItem('dehub_token_expires_at', String(Date.now() + 15 * 60_000));
};

describe('livechat sockets across a token rotation', () => {
  beforeEach(() => { made.length = 0; vi.resetModules(); localStorage.clear(); });

  it('keeps the same connection, and its listeners, when the same person gets a fresh token', async () => {
    signIn(jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const first = getSocket('stream:1');
    signIn(jwt('0xabc') + 'x');
    const again = getSocket('global');
    expect(again).not.toBe(first);
    expect(getSocket('stream:1')).toBe(first);
    expect((first as unknown as FakeSocket).disconnect).not.toHaveBeenCalled();
    expect((first as unknown as FakeSocket).engineClose).not.toHaveBeenCalled();
    expect(await handshake(first as unknown as FakeSocket)).toEqual({ token: jwt('0xabc') + 'x' });
  });

  it('reconnects the same connection under a different person', async () => {
    signIn(jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const first = getSocket('stream:1') as unknown as FakeSocket;
    signIn(jwt('0xdef'));
    expect(getSocket('stream:1')).toBe(first);
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(first.engineClose).toHaveBeenCalledTimes(1);
    expect(await handshake(first)).toEqual({ token: jwt('0xdef') });
  });

  it('reconnects after a sleep with the token it has now, not the one it started with', async () => {
    signIn(jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const s = getSocket('global') as unknown as FakeSocket;
    // Rotated while nothing asked for a socket: the reconnect still reads it.
    signIn(jwt('0xabc') + 'rotated');
    expect(await handshake(s)).toEqual({ token: jwt('0xabc') + 'rotated' });
  });

  it('signs a connection the server took as a guest back in, once', async () => {
    signIn(jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const s = getSocket('global') as unknown as FakeSocket & { id?: string };
    s.id = 'conn-1';
    const pong = s.handlers['livechat:pong'][0];
    pong({ connected: true, isAuthenticated: false });
    pong({ connected: true, isAuthenticated: false });
    await new Promise((r) => setTimeout(r, 0));
    const auths = s.emit.mock.calls.filter(([event]) => event === 'livechat:authenticate');
    expect(auths).toEqual([['livechat:authenticate', { token: jwt('0xabc') }]]);
  });

  it('sends the current token with a message so the server can sign the connection in on the spot', async () => {
    signIn(jwt('0xabc'));
    const { getSocket, emitSendMessage } = await import('@/lib/api/dehub/socket');
    const s = getSocket('global') as unknown as FakeSocket;
    emitSendMessage({ roomId: 'global', content: 'hi' });
    const sent = Object.fromEntries(s.emit.mock.calls.filter(([e]) => String(e).endsWith('endMessage')));
    expect(sent['livechat:sendMessage']).toMatchObject({ content: 'hi', token: jwt('0xabc') });
    expect(sent['sendMessage'].token).toBeUndefined();
  });
});
