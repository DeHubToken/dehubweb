import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoginModalBody } from './LoginModalBody';
import type { LoginStep } from './steps';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: false }), useConnectors: () => [],
  useConnect: () => ({ connectAsync: vi.fn() }), useDisconnect: () => ({ disconnectAsync: vi.fn() }),
}));
vi.mock('@/components/app/WagmiScope', () => ({ WagmiScope: ({ children }: any) => children }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isConnecting: false, isAuthenticated: false }) }));
vi.mock('@/hooks/use-surface-draft', () => ({ useSurfaceDraft: (_key: string, value: string) => useState(value) }));
vi.mock('@/lib/web3auth', () => ({ getWalletDeepLink: vi.fn(), isMobileDevice: () => false, isWalletInAppBrowser: () => false }));
vi.mock('@/lib/wagmi', () => ({ clearWagmiStorage: vi.fn() }));
vi.mock('@/lib/passkey-login', () => ({ PasskeyCancelledError: class extends Error {}, PasskeyLoginError: class extends Error {}, PasskeyUnsupportedError: class extends Error {} }));
vi.mock('@/lib/login-probes', () => ({ loginProbesSnapshot: () => ({ passkey: false, telegram: false }), resolveLoginProbes: vi.fn() }));
vi.mock('@/lib/wallet-setup-intent', () => ({ getWalletSetupIntent: () => null, setWalletSetupIntent: vi.fn() }));
vi.mock('./LoginSavedProfiles', () => ({ LoginSavedProfiles: () => null }));

function SheetBody({ layout = 'default' }: { layout?: 'default' | 'stack' }) {
  const [step, setStep] = useState<LoginStep>('main');
  return <LoginModalBody open step={step} setStep={setStep} layout={layout} />;
}
afterEach(cleanup);

it.each(['default', 'stack'] as const)('keeps Telegram before Wallet when availability probing fails in %s layout', (layout) => {
  render(<SheetBody layout={layout} />);
  const telegram = screen.getByRole('button', { name: 'loginModal.continueTelegram' });
  const wallet = screen.getByRole('button', { name: 'loginModal.connectWallet' });
  expect(telegram.compareDocumentPosition(wallet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('Import Wallet immediately replaces sign-in options with the secret form', async () => {
  render(<SheetBody />);
  fireEvent.click(screen.getByRole('button', { name: 'copy.a865110e919b' }));
  expect(await screen.findByRole('textbox')).toHaveAttribute('autocomplete', 'off');
  expect(screen.queryByRole('button', { name: 'loginModal.continueGoogle' })).toBeNull();
  expect(screen.queryByText('loginModal.importIntentHint')).toBeNull();
});

it('account migration keeps its identity sign-in flow separate', () => {
  render(<SheetBody />);
  fireEvent.click(screen.getByRole('button', { name: 'loginModal.migrateAccount' }));
  expect(screen.getByText('loginModal.migrateIntentHint')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'loginModal.continueGoogle' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
});
