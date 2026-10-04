import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoginWalletsStep } from './LoginWalletsStep';

const mocks = vi.hoisted(() => ({ ensure: vi.fn() }));
vi.mock('@/lib/wagmi-wallets', () => ({ ensureWalletConnectors: mocks.ensure }));
vi.mock('@/lib/web3auth', () => ({ isMobileDevice: () => false, isWalletInAppBrowser: () => false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback || _key }) }));
vi.mock('@rainbow-me/rainbowkit', () => ({
  RainbowKitProvider: ({ children }: any) => <>{children}</>,
  darkTheme: () => ({}),
  WalletButton: { Custom: ({ children }: any) => children({ mounted: true, connect: vi.fn() }) },
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('offers an explicit Continue action for an already connected wallet', async () => {
  const continueWallet = vi.fn();
  const props = {
    isConnecting: false, activeProvider: null,
    connectedAddress: '0x1234567890123456789012345678901234567890',
    connectedWalletName: 'Rabby', connectedWalletId: 'io.rabby',
    discoveredWallets: [{ id: 'io.rabby', name: 'Rabby' }],
    onContinueConnectedWallet: continueWallet,
    onWalletConnect: vi.fn(), onWalletConnectConnect: vi.fn(),
  };
  const { rerender } = render(<LoginWalletsStep {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue', exact: true }));
  expect(continueWallet).toHaveBeenCalledTimes(1);
  rerender(<LoginWalletsStep {...props} isConnecting />);
  expect(screen.getByRole('button', { name: 'Loading...', exact: true })).toBeDisabled();
});

it('recovers a failed connector initialization without trapping the user on a spinner', async () => {
  mocks.ensure.mockImplementationOnce(() => { throw new Error('Temporary connector failure'); });
  render(<LoginWalletsStep isConnecting={false} activeProvider={null} onWalletConnect={vi.fn()} onWalletConnectConnect={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load wallets');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: /MetaMask/ })).toBeEnabled();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mocks.ensure).toHaveBeenCalledTimes(2);
});
