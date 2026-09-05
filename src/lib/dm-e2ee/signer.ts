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
import { getAccount, signMessage } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { getEoaProvider, restoreWalletSession } from '@/lib/smart-wallet';
import { resolveSigningAccount } from '@/lib/wallet-accounts';

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
    // Sign as the account the wallet is actually holding, not the one this tab
    // wrote down when the connector attached: a switched MetaMask account makes
    // the remembered address one the extension refuses to sign for, and answers
    // -32602 with nothing the app can do about it (see wallet-accounts.ts).
    const { address: signer } = await resolveSigningAccount(getAccount(wagmiConfig).connector, address);
    return signMessage(wagmiConfig, { message, account: signer as `0x${string}` });
  }

  let provider = getEoaProvider();
  if (!provider) {
    try {
      provider = await restoreWalletSession();
    } catch {
      provider = null;
    }
  }
  if (!provider) {
    // Raise the app's own unlock prompt rather than failing mutely. On a
    // returning visit the vault is locked more often than not, and this is the
    // only thing between the user and encrypted messages — without the prompt
    // the chat just sends in the clear for ever and reports nothing. The hook
    // retries on dehub:wallet-lock-changed.
    try { window.dispatchEvent(new Event('dehub:wallet-unlock-required')); } catch { /* SSR */ }
    throw new WalletLockedError();
  }

  let signer = address;
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    if (accounts?.[0]) signer = accounts[0];
  } catch { /* fall back to the identity address */ }
  return personalSign(provider, message, signer);
}
