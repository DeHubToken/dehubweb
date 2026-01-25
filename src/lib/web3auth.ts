/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Uses Web3Auth v10 Modal SDK with Smart Accounts.
 * External wallets use EOA directly, embedded wallets get smart accounts.
 */

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

/**
 * Initialize Web3Auth - call this early in app lifecycle
 */
export async function initWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] initWeb3Auth called");
  console.log("[Web3Auth] Current instance status:", web3authInstance?.status || "null");
  
  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    console.log("[Web3Auth] Already initialized, returning existing instance");
    return web3authInstance;
  }
  if (isInitializing && initPromise) {
    console.log("[Web3Auth] Already initializing, returning existing promise");
    return initPromise;
  }

  isInitializing = true;
  console.log("[Web3Auth] Starting initialization...");
  
  initPromise = (async () => {
    try {
      console.log("[Web3Auth] Fetching config from edge functions...");
      const [clientId, pimlicoApiKey] = await Promise.all([getWeb3AuthClientId(), getPimlicoApiKey()]);
      console.log("[Web3Auth] Config fetched - clientId:", clientId?.substring(0, 10) + "...", "pimlicoKey:", pimlicoApiKey?.substring(0, 10) + "...");

      const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;

      // Web3Auth v10 modal options - popup is the default uxMode
      const web3AuthOptions: Web3AuthOptions = {
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        accountAbstractionConfig: {
          smartAccountType: "safe",
          chains: [
            {
              chainId: "0x2105",
              bundlerConfig: { url: pimlicoUrl },
              paymasterConfig: { url: pimlicoUrl },
            },
          ],
        },
        useAAWithExternalWallet: false,
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
      };

      console.log("[Web3Auth] Creating Web3Auth instance with options:", {
        clientId: clientId?.substring(0, 10) + "...",
        network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        chainId: "0x2105",
        useAAWithExternalWallet: false,
      });
      
      web3authInstance = new Web3Auth(web3AuthOptions);
      console.log("[Web3Auth] Instance created, status:", web3authInstance.status);

      // Initialize and wait for ready state
      console.log("[Web3Auth] Calling init()...");
      await web3authInstance.init();
      console.log("[Web3Auth] init() completed, status:", web3authInstance.status);
      console.log("[Web3Auth] connected:", web3authInstance.connected);
      console.log("[Web3Auth] provider:", web3authInstance.provider ? "exists" : "null");
      
      // Wait for the instance to be truly ready
      if (web3authInstance.status !== "ready" && web3authInstance.status !== "connected") {
        console.log("[Web3Auth] Waiting for ready state, current:", web3authInstance.status);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error("[Web3Auth] Timeout waiting for ready state");
            reject(new Error("Web3Auth init timeout"));
          }, 10000);
          const checkReady = () => {
            console.log("[Web3Auth] Checking status:", web3authInstance?.status);
            if (web3authInstance?.status === "ready" || web3authInstance?.status === "connected") {
              console.log("[Web3Auth] Now ready!");
              clearTimeout(timeout);
              resolve();
            } else if (web3authInstance?.status === "errored") {
              console.error("[Web3Auth] Initialization errored");
              clearTimeout(timeout);
              reject(new Error("Web3Auth initialization failed"));
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      }
      
      console.log("[Web3Auth] ✓ Fully initialized, final status:", web3authInstance.status);

      if (web3authInstance.status === "errored") {
        throw new Error("[Web3Auth] Failed to initialize - check Client ID and allowed origins");
      }
      
      return web3authInstance;
    } catch (error) {
      console.error("[Web3Auth] Initialization error:", error);
      web3authInstance = null;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Get the initialized Web3Auth instance - throws if not initialized
 */
export function getWeb3Auth(): Web3Auth {
  console.log("[Web3Auth] getWeb3Auth called, status:", web3authInstance?.status || "null");
  if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
    throw new Error("Web3Auth not initialized. Call initWeb3Auth() first.");
  }
  return web3authInstance;
}

/**
 * Get Web3Auth instance, initializing if needed (for backward compatibility)
 */
export async function getOrInitWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] getOrInitWeb3Auth called");
  if (web3authInstance?.status === "ready" || web3authInstance?.status === "connected") {
    return web3authInstance;
  }
  return initWeb3Auth();
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
