import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ current: null as any, connectors: [] as any[] }));
const provider = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: {
  get connectors() { return state.connectors; },
  _internal: { connectors: {
    setup: (factory: any) => factory({ chains: [{ id: 8453 }], emitter: { emit: vi.fn() } }),
    setState: (update: any) => { state.connectors = update(state.connectors); },
  } },
} }));
vi.mock('@/lib/smart-wallet', () => ({
  activateWalletKey: vi.fn(async () => { state.current = provider; return provider; }),
  restoreWalletSession: vi.fn(async () => state.current),
  isUnlockAvailable: () => !!state.current,
  lockWallet: vi.fn(() => { state.current = null; }),
}));
import { activateWalletKey, lockWallet } from '@/lib/smart-wallet';
import { ensureImportedWalletConnector, prepareImportedWallet, finishImportedWallet } from './imported-wallet';

beforeEach(async () => {
  await finishImportedWallet(false);
  state.current = null;
  state.connectors = [];
  vi.clearAllMocks();
  provider.request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'private_key') return 'test-private-key';
    return 'signature';
  });
});

it('connects the imported EOA and restores the vault after profile handover', async () => {
  await prepareImportedWallet('test-private-key');
  const connector = ensureImportedWalletConnector();
  expect(ensureImportedWalletConnector()).toBe(connector);
  expect(await connector.connect()).toEqual({ accounts: ['0x1111111111111111111111111111111111111111'], chainId: 8453 });
  lockWallet();
  await finishImportedWallet(true);
  expect(activateWalletKey).toHaveBeenCalledTimes(2);
  expect(await connector.isAuthorized()).toBe(true);
});

it('cannot keep signing through a cached provider after the wallet locks', async () => {
  await prepareImportedWallet('test-private-key');
  const connector = ensureImportedWalletConnector();
  const cached = await connector.getProvider();
  await finishImportedWallet(true);
  lockWallet();
  await expect(cached.request({ method: 'personal_sign' })).rejects.toThrow('reconnect');
  expect(await connector.isAuthorized()).toBe(false);
});

it('clears key access after a failed import or disconnect', async () => {
  await prepareImportedWallet('test-private-key');
  const connector = ensureImportedWalletConnector();
  await finishImportedWallet(false);
  expect(await connector.isAuthorized()).toBe(false);
  await prepareImportedWallet('test-private-key');
  await connector.disconnect();
  expect(await connector.isAuthorized()).toBe(false);
});
