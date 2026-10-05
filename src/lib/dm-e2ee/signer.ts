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
import { getAccount, reconnect, signMessage, watchAccount, type Connector } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { getEoaProvider, restoreWalletSession } from '@/lib/smart-wallet';
import { resolveSigningAccount } from '@/lib/wallet-accounts';
import { ensureWalletRuntime } from '@/lib/wallet-runtime';
import { prepareWalletRelay, waitForWalletSignature } from '@/lib/wallet-relay';

export class WalletLockedError extends Error {
  constructor() {
    super('Unlock your wallet to enable encrypted messages');
    this.name = 'WalletLockedError';
  }
}

type ConnectionSource = 'web3auth' | 'wagmi' | null;

export class WalletConnectionError extends Error {
  constructor() {
    super('Reconnect your wallet to turn on encryption.');
    this.name = 'WalletConnectionError';
  }
}

function isLiveConnector(connector: Connector | undefined): connector is Connector {
  return typeof connector?.getProvider === 'function'
    && typeof connector.getAccounts === 'function'
    && typeof connector.getChainId === 'function';
}

async function waitForReconnection(): Promise<void> {
  const pending = () => ['connecting', 'reconnecting'].includes(getAccount(wagmiConfig).status);
  if (!pending()) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch();
      reject(new WalletConnectionError());
    }, 15_000);
    const finish = () => {
      if (pending()) return;
      clearTimeout(timer);
      unwatch();
      resolve();
    };
    const unwatch = watchAccount(wagmiConfig, { onChange: finish });
    finish();
  });
}

async function encryptionConnector(): Promise<Connector> {
  const rememberedId = getAccount(wagmiConfig).connector?.id;
  const { ensureWalletConnectors } = await import('@/lib/wagmi-wallets');
  ensureWalletConnectors();
  await ensureWalletRuntime();
  await waitForReconnection();
  let connector = getAccount(wagmiConfig).connector;
  if (isLiveConnector(connector)) return connector;

  // Persisted wagmi connectors contain metadata, not callable methods. Restore
  // only the remembered wallet; an unrelated extension must not sign this key.
  const registered = wagmiConfig.connectors.find(c => c.id === (connector?.id ?? rememberedId));
  if (registered) {
    await reconnect(wagmiConfig, { connectors: [registered] });
    await waitForReconnection();
    connector = getAccount(wagmiConfig).connector;
    if (isLiveConnector(connector)) return connector;
  }
  throw new WalletConnectionError();
}

async function personalSign(provider: any, message: string, address: string): Promise<string> {
  const encoded = `0x${Array.from(new TextEncoder().encode(message), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  await prepareWalletRelay(provider);
  try {
    return await waitForWalletSignature<string>(() => provider.request({ method: 'personal_sign', params: [encoded, address] }));
  } catch (error: any) {
    if (error?.code !== -32602 && !/invalid params|invalid parameters/i.test(error?.message ?? '')) throw error;
    return await waitForWalletSignature<string>(() => provider.request({ method: 'personal_sign', params: [address, encoded] }));
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
    const connector = await encryptionConnector();
    const { address: signer } = await resolveSigningAccount(connector, address);
    await prepareWalletRelay(await connector.getProvider());
    return waitForWalletSignature(() => signMessage(wagmiConfig, { connector, message, account: signer as `0x${string}` }));
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
