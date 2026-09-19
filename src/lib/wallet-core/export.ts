import { getWalletProtection } from './protection';
import { decryptString } from './crypto';
import { deriveFromSecret } from './derive';
import { unlockWithBiometrics } from './biometric-unlock';
import { assertWalletAddress } from './assert-wallet-address';

/** Export uses the same encrypted backups as unlock, with fresh verification. */
export async function exportWalletPrivateKey(
  userId: string,
  accountAddress: string,
  password?: string,
): Promise<string> {
  if (!accountAddress) throw new Error('The active wallet could not be verified. Please reopen your account.');
  const protection = await getWalletProtection(userId);
  const wallet = protection.wallet;
  let secret: string;
  if (password !== undefined) {
    if (!wallet) {
      throw new Error('Your encrypted wallet backup is unavailable on this device. Retry your original sign-in method, or export from a device where you can unlock this wallet.');
    }
    if (!protection.hasPassword || !wallet.payload) {
      throw new Error(protection.seedIsPasskeyWrapped
        ? 'Export from the mobile device where you set up this wallet, or add a wallet password there first.'
        : 'This wallet has no password backup. Use biometrics instead.');
    }
    secret = await decryptString(wallet.payload, password);
  } else {
    secret = await unlockWithBiometrics(userId, protection.wraps);
  }
  const derived = deriveFromSecret(secret);
  if (wallet) await assertWalletAddress(derived.ethAddress, wallet.ethAddress);
  // The local cache can outlive a profile switch. Never reveal another
  // wallet's key just because its cached ciphertext decrypts successfully.
  await assertWalletAddress(derived.ethAddress, accountAddress);
  return derived.ethPrivateKey;
}
