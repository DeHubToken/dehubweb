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
}));
vi.mock('@/lib/smart-account-address', () => ({ predictSafeAddress: async () => mocks.safe }));
vi.mock('@/lib/wallet-core/derive', () => ({
  deriveFromSecret: () => ({ ethAddress: mocks.owner, ethPrivateKey: 'test-key', secret: 'test-secret' }),
}));
vi.mock('@/lib/wallet-core/crypto', () => ({ decryptString: async () => 'test-secret', encryptString: vi.fn() }));
vi.mock('@/lib/wallet-core/store', () => ({ saveWallet: mocks.saveWallet, fetchRecoveryPayload: vi.fn() }));
vi.mock('@/lib/wallet-core/protection', () => ({
  loadWalletOrCached: async () => ({ ethAddress: mocks.expected, payload: {} }),
  getWalletProtection: async () => ({
    wallet: { ethAddress: mocks.expected, payload: {} }, wraps: mocks.biometric ? [{}] : [],
    biometricAvailable: mocks.biometric, noWalletOnServer: false, stateUnknown: false,
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
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('@/lib/wallet-reconnect', () => ({ requestSessionWalletConnect: vi.fn() }));
vi.mock('@/components/app/DeHubLoader', () => ({ DeHubPageLoader: () => null }));
vi.mock('@/lib/wallet-core/passwordStrength', () => ({ assessPassword: vi.fn(), MIN_PASSWORD_LENGTH: 8 }));
vi.mock('@/lib/wallet-core/recovery', () => ({
  generateRecoveryCode: vi.fn(), encryptSeedWithRecoveryCode: vi.fn(),
  decryptSeedWithRecoveryCode: vi.fn(), isValidRecoveryCode: vi.fn(),
}));
vi.mock('@/lib/wallet-core/clipboard', () => ({ copyThenClear: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.expected = mocks.safe;
  mocks.biometric = false;
});
afterEach(cleanup);

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
