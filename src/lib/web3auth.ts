/**
 * Web3Auth Configuration
 * ======================
 * Initializes and configures Web3Auth for multi-provider wallet authentication.
 */

import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, type IProvider } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { supabase } from '@/integrations/supabase/client';

// Chain config for Base mainnet (used by DeHub)
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0x2105', // Base mainnet (8453 in decimal)
  rpcTarget: 'https://mainnet.base.org',
  displayName: 'Base Mainnet',
  blockExplorerUrl: 'https://basescan.org',
  ticker: 'ETH',
  tickerName: 'Ethereum',
  logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
};

let web3authInstance: Web3Auth | null = null;
let isInitializing = false;
let initPromise: Promise<Web3Auth> | null = null;

async function getWeb3AuthClientId(): Promise<string> {
  // Try to get from edge function
  try {
    const { data, error } = await supabase.functions.invoke('get-web3auth-config');
    if (!error && data?.clientId) {
      return data.clientId;
    }
  } catch (e) {
    console.warn('Failed to fetch Web3Auth config from edge function:', e);
  }
  
  throw new Error('Web3Auth client ID not configured');
}

export async function getWeb3Auth(): Promise<Web3Auth> {
  // Return existing instance if available
  if (web3authInstance?.status === 'connected' || web3authInstance?.status === 'ready') {
    return web3authInstance;
  }

  // If already initializing, wait for it
  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  
  initPromise = (async () => {
    const clientId = await getWeb3AuthClientId();

    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: { chainConfig },
    });

    web3authInstance = new Web3Auth({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      privateKeyProvider: privateKeyProvider as any,
      uiConfig: {
        appName: 'DeHub',
        mode: 'dark',
        loginMethodsOrder: ['email_passwordless', 'google', 'twitter', 'discord', 'apple'],
        logoLight: 'https://content.dehub.io/images/dehub-logo.png',
        logoDark: 'https://content.dehub.io/images/dehub-logo.png',
        defaultLanguage: 'en',
        primaryButton: 'socialLogin',
      },
    });

    await web3authInstance.init();
    isInitializing = false;
    
    return web3authInstance;
  })();

  return initPromise;
}

export function getWeb3AuthInstance(): Web3Auth | null {
  return web3authInstance;
}

export function getWeb3AuthProvider(): IProvider | null {
  return web3authInstance?.provider || null;
}

export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) {
    await web3authInstance.logout();
  }
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}
