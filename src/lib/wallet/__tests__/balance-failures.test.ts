import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/contracts/aa-utils', () => ({ readContract: vi.fn() }));
vi.mock('@/lib/contracts/dhb-token', () => ({
  BASE_CHAIN_ID: 8453, BNB_CHAIN_ID: 56, ETH_CHAIN_ID: 1,
  initChainRpcUrls: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../rpc', () => ({ walletRpc: vi.fn() }));
import { walletRpc } from '../rpc';
import { getAllTokenBalances } from '../tokens';

afterEach(() => { vi.resetAllMocks(); localStorage.clear(); });
const owner = '0x1111111111111111111111111111111111111111';

it('keeps a known native balance when an individual token cannot be read', async () => {
  vi.mocked(walletRpc).mockImplementation(async (_chain, method) => {
    if (method === 'eth_call') throw new Error('offline');
    return '0xde0b6b3a7640000';
  });
  const tokens = await getAllTokenBalances(owner, 1);
  expect(tokens.find(token => token.isNative)).toMatchObject({ balance: 1000000000000000000n, balanceUnavailable: false });
  expect(tokens.filter(token => !token.isNative).every(token => token.balanceUnavailable && token.formattedBalance === '—')).toBe(true);
});

it('reports a failed chain when every balance read fails', async () => {
  vi.mocked(walletRpc).mockRejectedValue(new Error('offline'));
  await expect(getAllTokenBalances(owner, 1)).rejects.toThrow('Balance unavailable');
});
