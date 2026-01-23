/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Uses Web3Auth with AccountAbstractionProvider for embedded wallets.
 * External wallets use EOA directly, embedded wallets get smart accounts.
 */

import { Web3Auth, Web3AuthOptions } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { AccountAbstractionProvider, SafeSmartAccount } from "@web3auth/account-abstraction-provider";
import { supabase } from "@/integrations/supabase/client";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x2105",
  rpcTarget: "https://mainnet.base.org",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://basescan.org/assets/base/images/svg/logos/chain-light.svg?v=25.1.2.0",
};

let web3authInstance: Web3Auth | null = null;
let isInitializing = false;
let initPromise: Promise<Web3Auth> | null = null;
let cachedClientId: string | null = null;
let cachedPimlicoKey: string | null = null;

async function getWeb3AuthClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  if (!error && data?.clientId) {
    cachedClientId = data.clientId;
    return cachedClientId;
  }
  throw new Error("Web3Auth client ID not configured");
}

async function getPimlicoApiKey(): Promise<string> {
  if (cachedPimlicoKey) return cachedPimlicoKey;
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  if (!error && data?.bundlerUrl) {
    const match = data.bundlerUrl.match(/apikey=([^&]+)/);
    if (match) {
      cachedPimlicoKey = match[1];
      return cachedPimlicoKey;
    }
  }
  throw new Error("Pimlico API key not configured");
}

export async function getWeb3Auth(): Promise<Web3Auth> {
  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    return web3authInstance;
  }
  if (isInitializing && initPromise) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    try {
      const [clientId, pimlicoApiKey] = await Promise.all([getWeb3AuthClientId(), getPimlicoApiKey()]);

      const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;

      // Create the Account Abstraction Provider for embedded wallets
      const accountAbstractionProvider = new AccountAbstractionProvider({
        config: {
          chainConfig,
          smartAccountInit: new SafeSmartAccount(),
          bundlerConfig: {
            url: pimlicoUrl,
          },
          paymasterConfig: {
            url: pimlicoUrl,
          },
        },
      });

      // Create the private key provider for the underlying key management
      const privateKeyProvider = new EthereumPrivateKeyProvider({
        config: { chainConfig },
      });

      // Web3Auth v10 modal options with AA provider (matches MetaMask tutorial)
      // Type assertion keeps us compatible with minor type mismatches across SDK packages.
      const web3AuthOptions: Web3AuthOptions & { accountAbstractionProvider?: unknown } = {
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        privateKeyProvider: privateKeyProvider as never,
        accountAbstractionProvider: accountAbstractionProvider as never,
        // External wallets keep their EOA, only embedded wallets get smart accounts
        useAAWithExternalWallet: false,
        uiConfig: {
          appName: "DeHub",
          mode: "dark",
          loginMethodsOrder: ["email_passwordless", "google", "twitter", "discord", "apple"],
          primaryButton: "socialLogin",
          modalZIndex: "99999",
          loginGridCol: 3,
        },
      };

      // Add the AA provider (property exists in runtime but may not exist in TS types)
      web3AuthOptions.accountAbstractionProvider = accountAbstractionProvider;

      web3authInstance = new Web3Auth(web3AuthOptions as Web3AuthOptions);

      // Web3Auth v10 modal SDK requires initModal() (not init()).
      // initModal() only mounts the UI - it does NOT mean auth is ready.
      // The user must interact with the modal for authentication to complete.
      const w3aAny = web3authInstance as unknown as { initModal?: () => Promise<void>; init?: () => Promise<void> };
      // if (typeof w3aAny.initModal === "function") {
      //   await w3aAny.initModal();
      // } else if (typeof w3aAny.init === "function") {
      await w3aAny.init();
      // }
      console.log("[Web3Auth] Modal initialized, status:", web3authInstance.status);

      // Only check for explicit error state - "not_ready" is expected after initModal()
      if (web3authInstance.status === "errored") {
        throw new Error("[Web3Auth] Failed to initialize - check Client ID and allowed origins");
      }
      return web3authInstance;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

export function getWeb3AuthInstance(): Web3Auth | null {
  return web3authInstance;
}

export function getWeb3AuthProvider() {
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
