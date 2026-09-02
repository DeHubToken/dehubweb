import { describe, it, expect, vi } from 'vitest';

import {
  isWrongAccountError,
  readLiveAccounts,
  requestAccountPicker,
  resolveSigningAccount,
} from '@/lib/wallet-accounts';

const A = '0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa';
const B = '0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb';

/** The shape viem hands back: the RPC code sits on a nested cause. */
const viemError = (code: number, message: string) => {
  const err: any = new Error('Signature request failed');
  err.name = 'InvalidParamsRpcError';
  err.cause = { code, message };
  return err;
};

const connectorWith = (accounts: string[], provider?: unknown) => ({
  id: 'metaMaskSDK',
  name: 'MetaMask',
  getAccounts: vi.fn(async () => accounts as readonly string[]),
  getProvider: vi.fn(async () => provider),
});

describe('isWrongAccountError', () => {
  it('recognises MetaMask refusing an account it does not hold', () => {
    // The exact pair seen in client_error_logs — this is the whole reason the
    // recovery path exists, so the match has to survive a viem wrapper.
    expect(
      isWrongAccountError(
        viemError(-32602, 'Invalid parameters: must provide an Ethereum address.'),
      ),
    ).toBe(true);
  });

  it('recognises an unauthorised provider', () => {
    expect(isWrongAccountError({ code: 4100, message: 'Unauthorized' })).toBe(true);
  });

  it('leaves a plain rejection alone', () => {
    // Sending a rejection to the account picker would reopen a prompt the
    // user just dismissed.
    expect(isWrongAccountError({ code: 4001, message: 'User rejected the request.' })).toBe(false);
  });

  it('leaves an unrelated invalid-params error alone', () => {
    expect(isWrongAccountError(viemError(-32602, 'Invalid parameters: chainId'))).toBe(false);
  });

  it('survives a null or string error', () => {
    expect(isWrongAccountError(null)).toBe(false);
    expect(isWrongAccountError('boom')).toBe(false);
  });
});

describe('readLiveAccounts', () => {
  it('lowercases what the connector reports', async () => {
    await expect(readLiveAccounts(connectorWith([A]))).resolves.toEqual([A.toLowerCase()]);
  });

  it('falls back to the provider when the connector cannot answer', async () => {
    const provider = { request: vi.fn(async () => [B]) };
    const connector = {
      getAccounts: vi.fn(async () => {
        throw new Error('not connected');
      }),
      getProvider: vi.fn(async () => provider),
    };
    await expect(readLiveAccounts(connector)).resolves.toEqual([B.toLowerCase()]);
    expect(provider.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
  });

  it('answers empty rather than throwing when nothing can be asked', async () => {
    await expect(readLiveAccounts(null)).resolves.toEqual([]);
  });
});

describe('resolveSigningAccount', () => {
  it('keeps the remembered address when the wallet still holds it', async () => {
    const resolved = await resolveSigningAccount(connectorWith([A, B]), A);
    expect(resolved).toMatchObject({ address: A.toLowerCase(), corrected: false });
  });

  it('signs with what the wallet actually has when they disagree', async () => {
    const resolved = await resolveSigningAccount(connectorWith([B]), A);
    expect(resolved).toMatchObject({ address: B.toLowerCase(), corrected: true });
  });

  it('leaves a silent wallet on the remembered address', async () => {
    // Nothing to correct against, so behave exactly as the code did before —
    // failing closed here would break WalletConnect mid-handshake.
    const resolved = await resolveSigningAccount(connectorWith([]), A);
    expect(resolved).toMatchObject({ address: A.toLowerCase(), corrected: false });
  });
});

describe('requestAccountPicker', () => {
  it('reads the account out of the granted permission', async () => {
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) =>
        method === 'wallet_requestPermissions'
          ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [B] }] }]
          : [],
      ),
    };
    await expect(requestAccountPicker(connectorWith([A], provider))).resolves.toBe(B.toLowerCase());
  });

  it('falls back to a fresh request when the wallet has no permissions method', async () => {
    // Phantom and older Trust builds answer -32601 here; they can still be
    // asked for accounts, so the picker must not give up at the first refusal.
    const provider = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'wallet_requestPermissions') throw { code: -32601, message: 'Unsupported' };
        return [B];
      }),
    };
    await expect(requestAccountPicker(connectorWith([A], provider))).resolves.toBe(B.toLowerCase());
  });

  it('returns null when the picker is dismissed', async () => {
    const provider = {
      request: vi.fn(async () => {
        throw { code: 4001, message: 'User rejected the request.' };
      }),
    };
    await expect(requestAccountPicker(connectorWith([A], provider))).resolves.toBeNull();
  });
});
