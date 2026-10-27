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

describe('livechat sockets across a token rotation', () => {
  beforeEach(() => { made.length = 0; vi.resetModules(); localStorage.clear(); });

  it('keeps the same connection, and its listeners, when the same person gets a fresh token', async () => {
    localStorage.setItem('dehub_token', jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const first = getSocket('stream:1');
    localStorage.setItem('dehub_token', jwt('0xabc') + 'x');
    const again = getSocket('global');
    expect(again).not.toBe(first);
    expect(getSocket('stream:1')).toBe(first);
    expect((first as unknown as FakeSocket).disconnect).not.toHaveBeenCalled();
    expect((first as unknown as FakeSocket).engineClose).not.toHaveBeenCalled();
    expect((first as unknown as FakeSocket).auth).toEqual({ token: jwt('0xabc') + 'x' });
  });

  it('reconnects the same connection under a different person', async () => {
    localStorage.setItem('dehub_token', jwt('0xabc'));
    const { getSocket } = await import('@/lib/api/dehub/socket');
    const first = getSocket('stream:1') as unknown as FakeSocket;
    localStorage.setItem('dehub_token', jwt('0xdef'));
    expect(getSocket('stream:1')).toBe(first);
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(first.engineClose).toHaveBeenCalledTimes(1);
    expect(first.auth).toEqual({ token: jwt('0xdef') });
  });
});
