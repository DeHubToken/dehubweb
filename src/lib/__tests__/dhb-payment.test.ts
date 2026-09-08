import { beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  ensureSignerOnChain: vi.fn(),
  getERC20Balance: vi.fn(),
  getWalletAddress: vi.fn(),
  writeContractAA: vi.fn(),
}));

vi.mock('@/lib/contracts/aa-utils', () => ({
  ...wallet,
  parseTxError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('@/lib/contracts/dhb-token', () => ({
  BASE_CHAIN_ID: 8453,
  BNB_CHAIN_ID: 56,
  getChainConfig: (chainId: number) => ({
    dhbToken: chainId === 8453 ? 'base-dhb' : 'bnb-dhb',
  }),
  toWei: (amount: number) => BigInt(amount) * 10n ** 18n,
}));

import { payDhb, readDhbBalance } from '@/lib/dhb-payment';

const ONE_DHB = 10n ** 18n;

describe('DHB payment chain preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.getWalletAddress.mockResolvedValue('0x1234');
    wallet.ensureSignerOnChain.mockResolvedValue(undefined);
    wallet.writeContractAA.mockResolvedValue({
      hash: '0xtx',
      wait: vi.fn().mockResolvedValue({ hash: '0xtx', status: 1 }),
    });
  });

  it('reads the balance silently so opening a drawer never asks for an unlock', async () => {
    wallet.getERC20Balance.mockResolvedValue(0n);

    await readDhbBalance();

    expect(wallet.getWalletAddress).toHaveBeenCalledWith({ silent: true });
  });

  it('prepares the BNB signer automatically when BNB is the funded chain', async () => {
    wallet.getERC20Balance.mockImplementation((token: string) =>
      Promise.resolve(token === 'bnb-dhb' ? 100_000n * ONE_DHB : 0n));

    const result = await payDhb(69_420, '0xtreasury', { context: 'DAO contribution' });

    expect(wallet.ensureSignerOnChain).toHaveBeenCalledWith(56);
    expect(wallet.writeContractAA).toHaveBeenCalledWith(
      'bnb-dhb',
      expect.anything(),
      'transfer',
      ['0xtreasury', 69_420n * ONE_DHB],
      { context: 'DAO contribution', chainId: 56 },
    );
    expect(result).toEqual({ txHash: '0xtx', chain: 'BNB', chainId: 56 });
  });

  it('keeps Base as the automatic first choice when both chains can pay', async () => {
    wallet.getERC20Balance.mockResolvedValue(100_000n * ONE_DHB);

    await payDhb(100, '0xtreasury', { context: 'DAO contribution' });

    expect(wallet.ensureSignerOnChain).toHaveBeenCalledWith(8453);
    expect(wallet.writeContractAA).toHaveBeenCalledWith(
      'base-dhb',
      expect.anything(),
      'transfer',
      ['0xtreasury', 100n * ONE_DHB],
      { context: 'DAO contribution', chainId: 8453 },
    );
  });
});
