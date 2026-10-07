import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WalletUnlockStep } from '../WalletUnlockStep';

const mocks = vi.hoisted(() => ({
  owner: '0x1111111111111111111111111111111111111111',
  safe: '0x2222222222222222222222222222222222222222',
  expected: '0x2222222222222222222222222222222222222222',
  biometric: false,
  complete: vi.fn(),
  saveWallet: vi.fn(),
  replaceLostWallet: vi.fn(),
  decrypt: vi.fn().mockResolvedValue('test-secret'),
  unknown: false,
}));
vi.mock('@/lib/smart-account-address', () => ({ predictSafeAddress: async () => mocks.safe }));
vi.mock('@/lib/wallet-core/derive', () => ({
  deriveFromSecret: () => ({ ethAddress: mocks.owner, ethPrivateKey: 'test-key', secret: 'test-secret' }),
}));
vi.mock('@/lib/wallet-core/crypto', () => ({ decryptString: mocks.decrypt, encryptString: vi.fn() }));
vi.mock('@/lib/wallet-core/store', () => ({ saveWallet: mocks.saveWallet, fetchRecoveryPayload: vi.fn() }));
vi.mock('@/lib/wallet-core/protection', () => ({
  loadWalletOrCached: async () => ({ ethAddress: mocks.expected, payload: {} }),
  getWalletProtection: async () => ({
    wallet: { ethAddress: mocks.expected, payload: {} }, wraps: mocks.biometric ? [{}] : [],
    biometricAvailable: mocks.biometric, noWalletOnServer: false, stateUnknown: mocks.unknown,
    seedIsPasskeyWrapped: false,
  }),
}));
vi.mock('@/lib/wallet-core/biometric-unlock', () => ({
  unlockWithBiometrics: async () => 'test-secret',
  enrollBiometricUnlock: vi.fn(), hasDeclinedBiometricOffer: () => true,
  declineBiometricOffer: vi.fn(), clearBiometricOfferDecline: vi.fn(),
  hasBiometricUsableHere: () => true, isPasswordBackupReminderSnoozed: () => false,
  snoozePasswordBackupReminder: vi.fn(), PasskeyCancelledError: class extends Error {},
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, replaceLostWallet: mocks.replaceLostWallet }) }));
vi.mock('@/lib/wallet-reconnect', () => ({ requestSessionWalletConnect: vi.fn() }));
vi.mock('@/components/app/DeHubLoader', () => ({ DeHubPageLoader: () => null }));
vi.mock('@/lib/wallet-core/passwordStrength', () => ({ assessPassword: async () => ({ longEnough: true, acceptable: true, breached: false }), MIN_PASSWORD_LENGTH: 8 }));
vi.mock('../PasswordStrengthMeter', () => ({ PasswordStrengthMeter: () => null }));
vi.mock('@/lib/wallet-core/recovery', () => ({
  generateRecoveryCode: vi.fn(), encryptSeedWithRecoveryCode: vi.fn(),
  decryptSeedWithRecoveryCode: vi.fn(), isValidRecoveryCode: vi.fn(),
}));
vi.mock('@/lib/wallet-core/clipboard', () => ({ copyThenClear: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.expected = mocks.safe;
  mocks.biometric = false;
  mocks.unknown = false;
});

it('offers password-only users a new wallet without decrypting their old wallet', async () => {
  render(<WalletUnlockStep userId="test-user" onComplete={mocks.complete} />);
  fireEvent.click(await screen.findByRole('button', { name: "Can't unlock? Create a new wallet" }));
  expect(screen.getByText(/No funds will be moved/)).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/New wallet password/), { target: { value: 'a-new-wallet-password' } });
  fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'a-new-wallet-password' } });
  expect((screen.getByRole('button', { name: 'Create a new wallet' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /old funds stay in the old wallet/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create a new wallet' }));
  await waitFor(() => expect(mocks.replaceLostWallet).toHaveBeenCalledWith('a-new-wallet-password'));
  expect(mocks.decrypt).not.toHaveBeenCalled();
  expect(mocks.saveWallet).not.toHaveBeenCalled();
});

it('does not offer replacement when the existing wallet could not be loaded', async () => {
  mocks.unknown = true;
  render(<WalletUnlockStep userId="test-user" onComplete={mocks.complete} />);
  await screen.findByText(/We couldn’t check how your wallet is protected/);
  expect(screen.queryByRole('button', { name: "Can't unlock? Create a new wallet" })).toBeNull();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function unlock(biometric: boolean) {
  mocks.biometric = biometric;
  render(<WalletUnlockStep userId="test-user" onComplete={mocks.complete} />);
  if (biometric) {
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
  } else {
    fireEvent.change(await screen.findByPlaceholderText('Wallet password'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
  }
}

it.each([false, true])('allows the owner of a stored Safe (biometric=%s)', async (biometric) => {
  await unlock(biometric);
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith('test-key'));
  expect(mocks.saveWallet).not.toHaveBeenCalled();
});
it.each([false, true])('refuses a different wallet without completing or saving (biometric=%s)', async (biometric) => {
  mocks.expected = '0x3333333333333333333333333333333333333333';
  await unlock(biometric);
  await screen.findByText(/This unlock opens a different wallet/);
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.saveWallet).not.toHaveBeenCalled();
});
