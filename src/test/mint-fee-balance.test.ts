import { describe, expect, it, vi, beforeEach } from 'vitest';

const native = vi.fn();
const erc20 = vi.fn();
vi.mock('@/lib/wallet/tokens', () => ({ getNativeBalance: (...a: unknown[]) => native(...a) }));
vi.mock('@/lib/contracts/aa-utils', () => ({ getERC20Balance: (...a: unknown[]) => erc20(...a) }));
vi.mock('@/lib/contracts/stream-controller', () => ({ getDHBBalance: vi.fn() }));

import { formatMintFee, mintFeeShortfall, mintFeeTopUpPath, mintFeeWei } from '@/lib/mint-fee-balance';

const bnbFee = {
  chainId: 56, amount: 0.00002503, symbol: 'BNB', tokenAddress: '0x0000000000000000000000000000000000000000',
  chargeable: true, decimals: 18, isNative: true, ttlSeconds: 60,
};
const dhbFee = { ...bnbFee, amount: 34.83, symbol: 'DHB', tokenAddress: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D', isNative: false };

describe('mint fee balance', () => {
  beforeEach(() => { native.mockReset(); erc20.mockReset(); });

  it('reads the chain coin for a native fee', async () => {
    native.mockResolvedValue(25_030_000_000_000n);
    expect(await mintFeeShortfall(bnbFee, '0xabc', 56)).toBe(false);
    native.mockResolvedValue(25_029_999_999_999n);
    expect(await mintFeeShortfall(bnbFee, '0xabc', 56)).toBe(true);
    expect(erc20).not.toHaveBeenCalled();
  });

  it('reads the token for a DHB fee', async () => {
    erc20.mockResolvedValue(0n);
    expect(await mintFeeShortfall(dhbFee, '0xabc', 56)).toBe(true);
    expect(native).not.toHaveBeenCalled();
  });

  it('decides nothing when the balance cannot be read', async () => {
    native.mockRejectedValue(new Error('rpc down'));
    expect(await mintFeeShortfall(bnbFee, '0xabc', 56)).toBeNull();
  });

  it('keeps small native fees exact and readable', () => {
    expect(mintFeeWei(bnbFee)).toBe(25_030_000_000_000n);
    expect(formatMintFee(0.00002503)).toBe('0.00002503');
    expect(formatMintFee(34.83)).toBe('34.83');
    expect(mintFeeTopUpPath(bnbFee)).toBe('/app/wallet');
    expect(mintFeeTopUpPath(dhbFee)).toBe('/app/buy');
  });
});
