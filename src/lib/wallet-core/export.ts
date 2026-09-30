import { getWalletProtection } from './protection';
import { decryptString } from './crypto';
import { deriveFromSecret, isValidMnemonic } from './derive';
import { unlockWithBiometrics } from './biometric-unlock';
import { assertWalletAddress } from './assert-wallet-address';

/** What Settings can show as a backup: the private key, plus the 12 words when the wallet has them. */
export interface WalletBackup {
  privateKey: string;
  /** The owner address the key derives (what user_wallets stores). */
  ethAddress: string;
  /** Null for wallets that were imported or migrated as a raw private key. */
  phrase: string | null;
}

/** Export uses the same encrypted backups as unlock, with fresh verification. */
export async function exportWalletPrivateKey(
  userId: string,
  accountAddress: string,
  password?: string,
): Promise<string> {
  return (await exportWalletBackup(userId, accountAddress, password)).privateKey;
}

export async function exportWalletBackup(
  userId: string,
  accountAddress: string,
  password?: string,
): Promise<WalletBackup> {
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
  const trimmed = secret.trim();
  return {
    privateKey: derived.ethPrivateKey,
    ethAddress: derived.ethAddress,
    phrase: isValidMnemonic(trimmed) ? trimmed.toLowerCase().split(/\s+/).join(' ') : null,
  };
}
