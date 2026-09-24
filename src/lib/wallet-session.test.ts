import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  base: vi.fn(async () => new Response('{}')),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn().mockResolvedValue('dehub-token') }));

const WALLET = '0x' + 'a'.repeat(40);
const REST = 'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/ai_conversations?select=*';

async function setup() {
  vi.resetModules();
  localStorage.clear();
  window.fetch = mocks.base as unknown as typeof fetch;
  const mod = await import('./wallet-session');
  mod.installWalletSessionFetch();
  return mod;
}

const sentHeaders = (call = 0) => new Headers((mocks.base.mock.calls[call] as unknown[])[1] ? ((mocks.base.mock.calls[call] as unknown[])[1] as RequestInit).headers : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockResolvedValue({
    data: { wallet: WALLET, token: `${WALLET}.9999999999.sig`, expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() },
    error: null,
  });
});

describe('wallet session fetch', () => {
  it('attaches the minted session to a wallet-scoped REST request', async () => {
    await setup();
    await window.fetch(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(mocks.invoke).toHaveBeenCalledWith('wallet-session', expect.objectContaining({
      headers: expect.objectContaining({ 'x-dehub-token': 'dehub-token' }),
    }));
    expect(sentHeaders().get('x-wallet-session')).toBe(`${WALLET}.9999999999.sig`);
  });

  it('mints once and reuses the session', async () => {
    await setup();
    await window.fetch(REST, { headers: { 'x-wallet-address': WALLET } });
    await window.fetch(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('leaves requests without a wallet and edge function calls untouched', async () => {
    await setup();
    await window.fetch(REST);
    await window.fetch('https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ai-quote', { headers: { 'x-wallet-address': WALLET } });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('still sends the request when a session cannot be minted', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('signed out') });
    await setup();
    await window.fetch(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(mocks.base).toHaveBeenCalledTimes(1);
    expect(sentHeaders().get('x-wallet-session')).toBeNull();
  });

  it('ignores a session minted for a different wallet', async () => {
    mocks.invoke.mockResolvedValue({
      data: { wallet: '0x' + 'b'.repeat(40), token: 'other', expiresAt: new Date(Date.now() + 3600e3 * 12).toISOString() },
      error: null,
    });
    await setup();
    await window.fetch(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(sentHeaders().get('x-wallet-session')).toBeNull();
  });
});
