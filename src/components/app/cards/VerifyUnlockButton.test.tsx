import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyUnlockButton } from './VerifyUnlockButton';

const mocks = vi.hoisted(() => ({ account: vi.fn(), balance: vi.fn(), metadata: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: '0xviewer', openLoginModal: vi.fn() }) }));
vi.mock('@/lib/api/dehub/users', () => ({ getAccountInfo: mocks.account }));
vi.mock('@/lib/contracts/aa-utils', () => ({ getERC20Balance: mocks.balance }));
vi.mock('@/lib/contracts/uniswap-swap', () => ({ isAutoSwapSupported: () => false }));
vi.mock('@/lib/wallet/tokens', () => ({ getERC20Metadata: mocks.metadata }));
vi.mock('@/lib/contracts/dhb-token', () => ({
  BASE_CHAIN_ID: 8453,
  getChainConfig: () => ({ dhbToken: '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c' }),
  fromWei: (value: bigint, decimals: number) => String(Number(value) / 10 ** decimals),
}));
vi.mock('@/components/ui/liquid-glass-bubble', () => ({ LiquidGlassBubble: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));
vi.mock('./PPVTopUpStep', () => ({ PPVTopUpStep: () => <div>Top up</div> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

beforeEach(() => { vi.clearAllMocks(); });

describe('holdings verification', () => {
  it('unlocks a Base gate from BNB staking without needing a working wallet RPC', async () => {
    mocks.account.mockResolvedValue({ balanceData: [{ chainId: 56, tokenAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d', walletBalance: 6142985, staked: 50000000 }] });
    mocks.balance.mockRejectedValue(new Error('RPC unavailable'));
    const onUnlocked = vi.fn();
    render(<VerifyUnlockButton requiredAmount={5} currency="DHB" tokenAddress="0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c" chainId={8453} onUnlocked={onUnlocked} />);
    fireEvent.click(screen.getByText('Verify & Unlock'));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce());
    expect(mocks.balance).not.toHaveBeenCalled();
  });

  it('does not treat a delegated badge as owned DHB', async () => {
    mocks.account.mockResolvedValue({ badgeBalance: 50000000, balanceData: [] });
    mocks.balance.mockResolvedValue(0n);
    const onUnlocked = vi.fn();
    render(<VerifyUnlockButton requiredAmount={5} currency="DHB" onUnlocked={onUnlocked} />);
    fireEvent.click(screen.getByText('Verify & Unlock'));
    await screen.findByText('Top up');
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('checks a custom token using its own decimals', async () => {
    mocks.balance.mockResolvedValue(5000000n);
    mocks.metadata.mockResolvedValue({ decimals: 6 });
    const onUnlocked = vi.fn();
    render(<VerifyUnlockButton requiredAmount={5} currency="USDC" tokenAddress="0xother" onUnlocked={onUnlocked} />);
    fireEvent.click(screen.getByText('Verify & Unlock'));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce());
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
