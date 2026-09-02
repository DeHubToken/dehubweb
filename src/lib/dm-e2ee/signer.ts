/**
 * Produce the one wallet signature the DM identity keys are derived from.
 *
 * Two wallet stacks, two signing paths (mirrors AuthProvider's login flow):
 *  - external wallets connected through wagmi sign with `signMessage`;
 *  - the DeHub embedded wallet signs with its EOA provider via `personal_sign`
 *    once the vault is unlocked. A locked vault surfaces as
 *    `WalletLockedError` so the caller can wait for the unlock rather than
 *    treating it as a failure.
 */
import { signMessage } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { getEoaProvider, restoreWalletSession } from '@/lib/smart-wallet';

export class WalletLockedError extends Error {
  constructor() {
    super('Unlock your wallet to enable encrypted messages');
    this.name = 'WalletLockedError';
  }
}

type ConnectionSource = 'web3auth' | 'wagmi' | null;

async function personalSign(provider: any, message: string, address: string): Promise<string> {
  try {
    return (await provider.request({ method: 'personal_sign', params: [message, address] })) as string;
  } catch {
    return (await provider.request({ method: 'personal_sign', params: [address, message] })) as string;
  }
}

export async function signEncryptionMessage(
  message: string,
  address: string,
  connectionSource: ConnectionSource,
): Promise<string> {
  if (connectionSource === 'wagmi') {
    return signMessage(wagmiConfig, { message, account: address as `0x${string}` });
  }

  let provider = getEoaProvider();
  if (!provider) {
    try {
      provider = await restoreWalletSession();
    } catch {
      provider = null;
    }
  }
  if (!provider) throw new WalletLockedError();

  let signer = address;
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    if (accounts?.[0]) signer = accounts[0];
  } catch { /* fall back to the identity address */ }
  return personalSign(provider, message, signer);
}
