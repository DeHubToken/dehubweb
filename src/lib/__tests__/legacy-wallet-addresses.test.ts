import { beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyWalletAddresses } from '@/lib/legacy-wallet-addresses';

vi.mock('@/lib/wallet-core/store', () => ({
  getCachedWallet: vi.fn(() => ({
    ethAddress: '0x1111111111111111111111111111111111111111',
    payload: null,
  })),
}));
vi.mock('@/lib/smart-account-address', () => ({
  predictSafeAddress: vi.fn(async () => '0x2222222222222222222222222222222222222222'),
}));

describe('legacyWalletAddresses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks the session, owner EOA and deterministic Safe without duplicates', async () => {
    await expect(legacyWalletAddresses('0x2222222222222222222222222222222222222222')).resolves.toEqual([
      '0x2222222222222222222222222222222222222222',
      '0x1111111111111111111111111111111111111111',
    ]);
  });
});
