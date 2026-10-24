import { beforeEach, expect, it, vi } from 'vitest';
const { createClient } = vi.hoisted(() => ({createClient: vi.fn((_url, _key, options) => ({options}))}));
vi.mock('@supabase/supabase-js', () => ({createClient}));
vi.mock('@/integrations/supabase/relayFetch', () => ({supabaseRelayFetch: vi.fn()}));
beforeEach(() => { vi.resetModules(); createClient.mockClear(); });
it('reuses the same wallet without sharing identity or OAuth storage with another wallet', async () => {
  const {walletScopedClient} = await import('./supabase-wallet-client');
  const first = walletScopedClient('0xAAA');
  expect(walletScopedClient('0xaaa')).toBe(first);
  expect(walletScopedClient('0xbbb')).not.toBe(first);
  expect(createClient).toHaveBeenCalledTimes(2);
  const firstOptions = createClient.mock.calls[0][2];
  const secondOptions = createClient.mock.calls[1][2];
  expect(firstOptions.global.headers['x-wallet-address']).toBe('0xaaa');
  expect(secondOptions.global.headers['x-wallet-address']).toBe('0xbbb');
  expect(firstOptions.auth).toMatchObject({persistSession:false, autoRefreshToken:false, detectSessionInUrl:false});
  expect(firstOptions.auth.storageKey).not.toBe(secondOptions.auth.storageKey);
});
