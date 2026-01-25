/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Uses Web3Auth v10 Modal SDK with Smart Accounts.
 * External wallets use EOA directly, embedded wallets get smart accounts.
 */

// In v10, everything is re-exported from @web3auth/modal
import { 
  Web3Auth, 
  type Web3AuthOptions, 
  WALLET_CONNECTORS,
  CHAIN_NAMESPACES,
  WEB3AUTH_NETWORK,
} from "@web3auth/modal";
import { supabase } from "@/integrations/supabase/client";

// Chain configuration for Base Mainnet
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

      // Web3Auth v10 modal options with AA configuration
      const web3AuthOptions: Web3AuthOptions = {
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        // v10 uses accountAbstractionConfig with chains array
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
        // Configure social login methods via modalConfig (v10 approach)
        modalConfig: {
          connectors: {
            [WALLET_CONNECTORS.AUTH]: {
              label: "auth",
              showOnModal: true,
              loginMethods: {
                email_passwordless: {
                  name: "Email",
                  showOnModal: true,
                },
                google: {
                  name: "Google",
                  showOnModal: true,
                },
                twitter: {
                  name: "Twitter",
                  showOnModal: true,
                },
                discord: {
                  name: "Discord",
                  showOnModal: true,
                },
                apple: {
                  name: "Apple",
                  showOnModal: true,
                },
              },
            },
          },
        },
        uiConfig: {
          uxMode: "popup",
        },
      };

      web3authInstance = new Web3Auth(web3AuthOptions);

      // Initialize modal
      await web3authInstance.init();
      console.log("[Web3Auth] Modal initialized, status:", web3authInstance.status);

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
