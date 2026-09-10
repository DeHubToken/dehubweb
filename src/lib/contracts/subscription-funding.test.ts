import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findSubscriptionFundingRoute,
  isSubscriptionSmartFundingChain,
} from './subscription-funding';
import { getERC20Balance, readContract } from './aa-utils';
import { getNativeBalance } from '@/lib/wallet/tokens';

vi.mock('./aa-utils', () => ({
  approveERC20: vi.fn(),
  getERC20Allowance: vi.fn(),
  getERC20Balance: vi.fn(),
  readContract: vi.fn(),
  waitForERC20Balance: vi.fn(),
  writeContractAA: vi.fn(),
}));

vi.mock('@/lib/wallet/tokens', () => ({
  DEFAULT_TOKENS: { 56: [], 8453: [] },
  getERC20TokenBalance: vi.fn(),
  getNativeBalance: vi.fn(),
}));

const params = {
  chainId: 8453 as const,
  owner: '0x1111111111111111111111111111111111111111',
  outputToken: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  outputSymbol: 'USDT',
  total: 1_000_000n,
};

describe('subscription smart funding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the existing settlement-token balance without quoting a swap', async () => {
    vi.mocked(getERC20Balance).mockResolvedValue(params.total);

    const funding = await findSubscriptionFundingRoute(params);

    expect(funding).toEqual({ balance: params.total, route: null });
    expect(getNativeBalance).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  it('quotes only the shortfall from the native token', async () => {
    vi.mocked(getERC20Balance).mockResolvedValue(250_000n);
    vi.mocked(getNativeBalance).mockResolvedValue(1_000_000_000_000_000_000n);
    vi.mocked(readContract).mockResolvedValue(400_000_000_000_000n);

    const funding = await findSubscriptionFundingRoute(params);

    expect(funding.route).toMatchObject({
      kind: 'single',
      amountOut: 750_000n,
      amountIn: 400_000_000_000_000n,
      token: { symbol: 'ETH', native: true },
    });
  });

  it('will not spend the native gas reserve', async () => {
    vi.mocked(getERC20Balance).mockResolvedValue(0n);
    vi.mocked(getNativeBalance).mockResolvedValue(20_000_000_000_100n);
    vi.mocked(readContract).mockResolvedValue(100n);

    const funding = await findSubscriptionFundingRoute(params);

    expect(funding.route).toBeNull();
  });

  it('is enabled only on deployed EVM subscription chains', () => {
    expect(isSubscriptionSmartFundingChain(8453)).toBe(true);
    expect(isSubscriptionSmartFundingChain(56)).toBe(true);
    expect(isSubscriptionSmartFundingChain(4663)).toBe(false);
    expect(isSubscriptionSmartFundingChain(101)).toBe(false);
  });
});
