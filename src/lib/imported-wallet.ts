import { createConnector } from 'wagmi';
import type { Address } from 'viem';
import { wagmiConfig } from '@/lib/wagmi';
import { activateWalletKey, restoreWalletSession, lockWallet, isUnlockAvailable } from '@/lib/smart-wallet';

export const IMPORTED_WALLET_ID = 'dehub-imported-wallet';

// Kept only while the explicit import is authenticating. Profile handover
// locks the outgoing vault before the incoming session is written.
let pendingProvider: Awaited<ReturnType<typeof activateWalletKey>> | null = null;

export async function prepareImportedWallet(privateKey: string) {
  pendingProvider = await activateWalletKey(privateKey);
}

export async function finishImportedWallet(success: boolean) {
  const provider = pendingProvider;
  pendingProvider = null;
  if (!provider) return;
  if (success) {
    const key = await provider.request({ method: 'private_key' }) as string;
    await activateWalletKey(key);
  } else {
    lockWallet();
  }
}

export function ensureImportedWalletConnector() {
  const existing = wagmiConfig.connectors.find(c => c.id === IMPORTED_WALLET_ID);
  if (existing) return existing;
  const connector = wagmiConfig._internal.connectors.setup(createConnector((config) => ({
    id: IMPORTED_WALLET_ID,
    name: 'Imported wallet',
    type: 'dehub-imported',
    async getProvider() {
      return {
        async request(args: Parameters<NonNullable<typeof pendingProvider>['request']>[0]) {
          if (!pendingProvider && !isUnlockAvailable()) throw new Error('Import your private key or seed phrase to reconnect this wallet.');
          const provider = pendingProvider ?? await restoreWalletSession();
          if (!provider) throw new Error('Import your private key or seed phrase to reconnect this wallet.');
          return provider.request(args);
        },
      };
    },
    async getAccounts() {
      const provider = await this.getProvider();
      return await provider.request({ method: 'eth_accounts' }) as Address[];
    },
    async getChainId() {
      const provider = await this.getProvider();
      return Number(await provider.request({ method: 'eth_chainId' }));
    },
    async connect<withCapabilities extends boolean = false>(parameters?: { withCapabilities?: withCapabilities | boolean; chainId?: number; isReconnecting?: boolean }) {
      const accounts = await this.getAccounts();
      if (parameters?.chainId && parameters.chainId !== await this.getChainId()) {
        await this.switchChain!({ chainId: parameters.chainId });
      }
      return {
        accounts: (parameters?.withCapabilities
          ? accounts.map(address => ({ address, capabilities: {} }))
          : accounts) as withCapabilities extends true ? readonly { address: Address; capabilities: Record<string, unknown> }[] : readonly Address[],
        chainId: await this.getChainId(),
      };
    },
    async disconnect() {
      pendingProvider = null;
      lockWallet();
    },
    async isAuthorized() {
      try { return (await this.getAccounts()).length > 0; } catch { return false; }
    },
    async switchChain({ chainId }) {
      const chain = config.chains.find(c => c.id === chainId);
      if (!chain) throw new Error('Unsupported chain');
      const provider = await this.getProvider();
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
      config.emitter.emit('change', { chainId });
      return chain;
    },
    onAccountsChanged(accounts) {
      if (!accounts.length) this.onDisconnect();
      else config.emitter.emit('change', { accounts: accounts as Address[] });
    },
    onChainChanged(chain) { config.emitter.emit('change', { chainId: Number(chain) }); },
    onDisconnect() { config.emitter.emit('disconnect'); },
  })));
  wagmiConfig._internal.connectors.setState(current => [...current, connector]);
  return connector;
}
