import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const provider = { request: vi.fn() };
  const connector = { id: 'wallet', getProvider: vi.fn(), getAccounts: vi.fn(), getChainId: vi.fn() };
  return {
    provider, connector,
    other: { id: 'other-wallet', getProvider: vi.fn() },
    account: {} as any,
    watch: undefined as undefined | (() => void),
    unwatch: vi.fn(), reconnect: vi.fn(), signMessage: vi.fn(), runtime: vi.fn(), ensure: vi.fn(),
    eoa: vi.fn(), restore: vi.fn(), relay: vi.fn(),
  };
});

vi.mock('@wagmi/core', () => ({
  getAccount: () => mocks.account,
  reconnect: mocks.reconnect,
  signMessage: mocks.signMessage,
  watchAccount: (_: unknown, { onChange }: { onChange: () => void }) => {
    mocks.watch = onChange;
    return mocks.unwatch;
  },
}));
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: { connectors: [mocks.connector, mocks.other] } }));
vi.mock('@/lib/wagmi-wallets', () => ({ ensureWalletConnectors: mocks.ensure }));
vi.mock('@/lib/wallet-runtime', () => ({ ensureWalletRuntime: mocks.runtime }));
vi.mock('@/lib/smart-wallet', () => ({ getEoaProvider: mocks.eoa, restoreWalletSession: mocks.restore }));
vi.mock('@/lib/wallet-relay', () => ({
  prepareWalletRelay: mocks.relay,
  waitForWalletSignature: (request: () => Promise<string>) => request(),
}));

import { signEncryptionMessage, WalletConnectionError } from './signer';

const address = '0x1111111111111111111111111111111111111111';
const message = 'DeHub Messages\nSign to unlock';
const hex = `0x${Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('')}`;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account = { status: 'connected', connector: mocks.connector };
  mocks.connector.getProvider.mockResolvedValue(mocks.provider);
  mocks.connector.getAccounts.mockResolvedValue([address]);
  mocks.provider.request.mockImplementation(async ({ method }) => method === 'eth_accounts' ? [address] : 'signature');
  mocks.signMessage.mockResolvedValue('signature');
  mocks.runtime.mockResolvedValue(undefined);
  mocks.eoa.mockReturnValue(mocks.provider);
  mocks.watch = undefined;
});
afterEach(() => vi.useRealTimers());

describe('DM identity signer', () => {
  it('rebinds persisted metadata to the same live wallet before signing', async () => {
    mocks.account = { status: 'connected', connector: { id: 'wallet' } };
    mocks.reconnect.mockImplementation(async () => {
      mocks.account = { status: 'connected', connector: mocks.connector };
    });
    await expect(signEncryptionMessage(message, address, 'wagmi')).resolves.toBe('signature');
    expect(mocks.reconnect).toHaveBeenCalledWith(expect.anything(), { connectors: [mocks.connector] });
    expect(mocks.signMessage).toHaveBeenCalledWith(expect.anything(), { connector: mocks.connector, message, account: address });
    expect(mocks.relay).toHaveBeenCalledWith(mocks.provider);
  });

  it('waits for the active reconnect before requesting a signature', async () => {
    mocks.account = { status: 'reconnecting', connector: { id: 'wallet' } };
    const pending = signEncryptionMessage(message, address, 'wagmi');
    await vi.waitFor(() => expect(mocks.watch).toBeDefined());
    expect(mocks.signMessage).not.toHaveBeenCalled();
    mocks.account = { status: 'connected', connector: mocks.connector };
    mocks.watch!();
    await expect(pending).resolves.toBe('signature');
    expect(mocks.reconnect).not.toHaveBeenCalled();
    expect(mocks.unwatch).toHaveBeenCalled();
  });

  it('offers reconnection when the remembered wallet is absent instead of signing with another wallet', async () => {
    mocks.account = { status: 'connected', connector: { id: 'removed-wallet' } };
    await expect(signEncryptionMessage(message, address, 'wagmi')).rejects.toBeInstanceOf(WalletConnectionError);
    expect(mocks.reconnect).not.toHaveBeenCalled();
    expect(mocks.signMessage).not.toHaveBeenCalled();
    expect(mocks.other.getProvider).not.toHaveBeenCalled();
  });

  it('signs the same UTF-8 bytes through the embedded provider', async () => {
    await signEncryptionMessage(message, address, 'web3auth');
    expect(mocks.provider.request).toHaveBeenLastCalledWith({ method: 'personal_sign', params: [hex, address] });
  });

  it('does not replay a refused signature', async () => {
    const refused = Object.assign(new Error('User rejected'), { code: 4001 });
    mocks.provider.request.mockImplementation(async ({ method }) => {
      if (method === 'eth_accounts') return [address];
      throw refused;
    });
    await expect(signEncryptionMessage(message, address, 'web3auth')).rejects.toBe(refused);
    expect(mocks.provider.request.mock.calls.filter(([arg]) => arg.method === 'personal_sign')).toHaveLength(1);
  });

  it('changes parameter order only after an invalid-params response', async () => {
    mocks.provider.request.mockImplementation(async ({ method, params }) => {
      if (method === 'eth_accounts') return [address];
      if (params[0] === hex) throw Object.assign(new Error('Invalid params'), { code: -32602 });
      return 'signature';
    });
    await expect(signEncryptionMessage(message, address, 'web3auth')).resolves.toBe('signature');
    expect(mocks.provider.request).toHaveBeenLastCalledWith({ method: 'personal_sign', params: [address, hex] });
  });
});
