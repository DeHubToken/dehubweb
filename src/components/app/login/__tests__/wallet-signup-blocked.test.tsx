import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WALLET_SIGNUP_BLOCKED_EVENT } from '@/lib/api/dehub/auth';
import { LoginModalBody } from '../LoginModalBody';
import type { LoginStep } from '../steps';

const wagmi = vi.hoisted(() => ({ disconnectAsync: vi.fn(async () => {}) }));
const setWagmiAuthIntent = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: true, address: '0xe7129f5f15b381b67cc6cf53defa9071ca670f1f', connector: { id: 'trust', name: 'Trust' } }),
  useDisconnect: () => ({ disconnectAsync: wagmi.disconnectAsync }),
  useConnectors: () => [],
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { dismiss, error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/components/app/WagmiScope', () => ({ WagmiScope: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/AuthContext', async () => ({
  AuthContext: (await import('react')).createContext(null),
  useAuth: () => ({ isConnecting: false, isAuthenticated: false, supabaseUserId: null, setWagmiAuthIntent }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }) }));
vi.mock('@/lib/login-probes', () => ({
  loginProbesSnapshot: () => ({ telegram: false, passkey: false }),
  resolveLoginProbes: async () => ({ telegram: false, passkey: false }),
}));
vi.mock('@/lib/wagmi', () => ({ clearWagmiStorage: vi.fn() }));
vi.mock('../LoginSavedProfiles', () => ({ LoginSavedProfiles: () => null }));
vi.mock('../LoginWalletsStep', () => ({ LoginWalletsStep: () => <button>Continue</button> }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('leaves the wallet list for the other sign-up options when a brand-new wallet is refused', async () => {
  const setStep = vi.fn();
  const view = render(<LoginModalBody open step="wallets" setStep={setStep} />);
  expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();

  act(() => {
    window.dispatchEvent(new CustomEvent(WALLET_SIGNUP_BLOCKED_EVENT, { detail: { address: '0xe7129f5f15b381b67cc6cf53defa9071ca670f1f' } }));
  });

  expect(setStep).toHaveBeenCalledWith('main' satisfies LoginStep);
  expect(dismiss).toHaveBeenCalledWith('wallet-signup-blocked');
  expect(wagmi.disconnectAsync).toHaveBeenCalled();

  view.rerender(<LoginModalBody open step="main" setStep={setStep} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('This wallet is brand new');
  expect(screen.getByRole('alert')).toHaveTextContent('Sign up with one of the options below');
});
