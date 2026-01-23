/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Uses Web3Auth's built-in accountAbstractionConfig with Pimlico paymaster.
 * External wallets use EOA directly, embedded wallets get smart accounts.
 */

import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
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
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  if (!error && data?.bundlerUrl) {
    // Extract API key from the URL
    const match = data.bundlerUrl.match(/apikey=([^&]+)/);
    if (match) return match[1];
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
    const [clientId, pimlicoApiKey] = await Promise.all([
      getWeb3AuthClientId(),
      getPimlicoApiKey(),
    ]);

    const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

    const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;

    web3authInstance = new Web3Auth({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      privateKeyProvider: privateKeyProvider as never,
      // Configure smart accounts via Web3Auth's built-in AA support
      accountAbstractionConfig: {
        smartAccountType: "safe",
        chains: [
          {
            chainId: "0x2105", // Base Mainnet
            bundlerConfig: {
              url: pimlicoUrl,
            },
            paymasterConfig: {
              url: pimlicoUrl,
            },
          },
        ],
      },
      // External wallets keep their EOA, only embedded wallets get smart accounts
      useAAWithExternalWallet: false,
      uiConfig: {
        appName: "DeHub",
        mode: "dark",
        loginMethodsOrder: ["email_passwordless", "google", "twitter", "discord", "apple"],
        logoLight: "https://dehub.io/default-icon.png",
        logoDark: "https://dehub.io/default-icon-dark.png",
        defaultLanguage: "en",
        primaryButton: "socialLogin",
      },
    });

    await web3authInstance.init();
    isInitializing = false;
    return web3authInstance;
  })();

  return initPromise;
}

export function getWeb3AuthInstance(): Web3Auth | null { return web3authInstance; }
export function getWeb3AuthProvider() { return web3authInstance?.provider || null; }

export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) await web3authInstance.logout();
}

export function isWeb3AuthConnected(): boolean { return web3authInstance?.connected ?? false; }
