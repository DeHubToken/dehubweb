/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Uses Web3Auth v10 Modal SDK with built-in Account Abstraction.
 * External wallets use EOA directly, embedded wallets get smart accounts.
 *
 * Note: Web3Auth v10 Modal SDK uses the built-in accountAbstractionConfig
 * which handles Safe Smart Account creation with Pimlico paymaster.
 */

import { Web3Auth, type Web3AuthOptions, WALLET_CONNECTORS, CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/modal";
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
  console.log("[Web3Auth] Fetching client ID from edge function...");
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  console.log("[Web3Auth] get-web3auth-config response:", { data, error });
  if (!error && data?.clientId) {
    cachedClientId = data.clientId;
    return cachedClientId;
  }
  throw new Error("Web3Auth client ID not configured");
}

async function getPimlicoApiKey(): Promise<string> {
  if (cachedPimlicoKey) return cachedPimlicoKey;
  console.log("[Web3Auth] Fetching Pimlico config from edge function...");
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  console.log("[Web3Auth] get-pimlico-config response:", { data, error });
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
  console.log("[Web3Auth] ========================================");
  console.log("[Web3Auth] initWeb3Auth() called");
  console.log("[Web3Auth] Current instance:", web3authInstance ? "exists" : "null");
  console.log("[Web3Auth] Current status:", web3authInstance?.status || "N/A");
  console.log("[Web3Auth] isInitializing:", isInitializing);
  console.log("[Web3Auth] ========================================");

  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    console.log("[Web3Auth] Already initialized with status:", web3authInstance.status);
    return web3authInstance;
  }

  if (isInitializing && initPromise) {
    console.log("[Web3Auth] Already initializing, returning existing promise");
    return initPromise;
  }

  isInitializing = true;
  console.log("[Web3Auth] Starting fresh initialization...");

  initPromise = (async () => {
    try {
      // Step 1: Fetch configuration
      console.log("[Web3Auth] Step 1: Fetching configuration...");
      const [clientId, pimlicoApiKey] = await Promise.all([getWeb3AuthClientId(), getPimlicoApiKey()]);
      console.log("[Web3Auth] ✓ Config fetched");
      console.log("[Web3Auth]   - clientId:", clientId?.substring(0, 15) + "...");
      console.log("[Web3Auth]   - pimlicoKey:", pimlicoApiKey?.substring(0, 15) + "...");

      const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;

      // Step 2: Create Web3Auth options using v10 built-in accountAbstractionConfig
      console.log("[Web3Auth] Step 2: Creating Web3Auth options...");
      const web3AuthOptions: Web3AuthOptions = {
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,

        // Web3Auth v10 built-in Account Abstraction config for Safe Smart Accounts
        accountAbstractionConfig: {
          smartAccountType: "safe",
          chains: [
            {
              chainId: "0x2105", // Base Mainnet
              bundlerConfig: { url: pimlicoUrl },
              paymasterConfig: { url: pimlicoUrl },
            },
          ],
        },
        useAAWithExternalWallet: false,

        // UI config for modal appearance
        uiConfig: {
          appName: "DeHub",
          mode: "dark",
          theme: {
            primary: "#ffffff",
            onPrimary: "#000000",
          },
        },
        modalConfig: {
          connectors: {
            [WALLET_CONNECTORS.AUTH]: {
              label: "auth",
              showOnModal: true,
              loginMethods: {
                email_passwordless: { name: "Email", showOnModal: true, authConnectionId: "dehub" },
                google: { name: "Google", showOnModal: true, authConnectionId: "dehub-mainnet" },
                twitter: { name: "Twitter", showOnModal: true },
                discord: { name: "Discord", showOnModal: true },
                sms_passwordless: {
                  name: "sms passwordless login",
                  authConnectionId: "dehub-sms",
                },
              },
            },
          },
        },
      };

      console.log("[Web3Auth] Options created:");
      console.log("[Web3Auth]   - network:", WEB3AUTH_NETWORK.SAPPHIRE_MAINNET);
      console.log("[Web3Auth]   - chainId:", chainConfig.chainId);
      console.log("[Web3Auth]   - smartAccountType: safe");
      console.log("[Web3Auth]   - useAAWithExternalWallet:", false);
      console.log("[Web3Auth]   - bundlerUrl:", pimlicoUrl.substring(0, 40) + "...");

      // Step 3: Create instance
      console.log("[Web3Auth] Step 3: Creating Web3Auth instance...");
      web3authInstance = new Web3Auth(web3AuthOptions);
      console.log("[Web3Auth] ✓ Instance created");
      console.log("[Web3Auth]   - Initial status:", web3authInstance.status);

      // Step 4: Initialize
      console.log("[Web3Auth] Step 4: Calling web3authInstance.init()...");
      const initStartTime = Date.now();
      await web3authInstance.init();
      const initDuration = Date.now() - initStartTime;
      console.log("[Web3Auth] ✓ init() completed in", initDuration, "ms");
      console.log("[Web3Auth]   - Status after init:", web3authInstance.status);
      console.log("[Web3Auth]   - Connected:", web3authInstance.connected);
      console.log("[Web3Auth]   - Provider:", web3authInstance.provider ? "exists" : "null");

      // Step 5: Wait for ready state if needed
      if (web3authInstance.status !== "ready" && web3authInstance.status !== "connected") {
        console.log("[Web3Auth] Step 5: Waiting for ready state...");
        console.log("[Web3Auth]   - Current status:", web3authInstance.status);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error("[Web3Auth] ✗ Timeout waiting for ready state after 10s");
            console.error("[Web3Auth]   - Final status:", web3authInstance?.status);
            reject(new Error("Web3Auth init timeout - status: " + web3authInstance?.status));
          }, 10000);

          let pollCount = 0;
          const checkReady = () => {
            pollCount++;
            const currentStatus = web3authInstance?.status;

            if (pollCount % 10 === 0) {
              console.log("[Web3Auth]   - Poll #" + pollCount + ", status:", currentStatus);
            }

            if (currentStatus === "ready" || currentStatus === "connected") {
              console.log("[Web3Auth] ✓ Ready state reached after", pollCount * 100, "ms");
              clearTimeout(timeout);
              resolve();
            } else if (currentStatus === "errored") {
              console.error("[Web3Auth] ✗ Status errored");
              clearTimeout(timeout);
              reject(new Error("Web3Auth initialization errored"));
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      } else {
        console.log("[Web3Auth] Step 5: Already in ready/connected state, skipping wait");
      }

      console.log("[Web3Auth] ========================================");
      console.log("[Web3Auth] ✓ INITIALIZATION COMPLETE");
      console.log("[Web3Auth]   - Final status:", web3authInstance.status);
      console.log("[Web3Auth]   - Connected:", web3authInstance.connected);
      console.log("[Web3Auth]   - Provider available:", !!web3authInstance.provider);
      console.log("[Web3Auth] ========================================");

      if (web3authInstance.status === "errored") {
        throw new Error("Web3Auth failed to initialize - check Client ID and allowed origins");
      }

      return web3authInstance;
    } catch (error) {
      console.error("[Web3Auth] ========================================");
      console.error("[Web3Auth] ✗ INITIALIZATION FAILED");
      console.error("[Web3Auth] Error:", error);
      if (error instanceof Error) {
        console.error("[Web3Auth] Error name:", error.name);
        console.error("[Web3Auth] Error message:", error.message);
        console.error("[Web3Auth] Error stack:", error.stack);
      }
      console.error("[Web3Auth] ========================================");
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
  console.log("[Web3Auth] getWeb3Auth() called");
  console.log("[Web3Auth]   - Instance exists:", !!web3authInstance);
  console.log("[Web3Auth]   - Status:", web3authInstance?.status || "N/A");

  if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
    const error = new Error(
      "Web3Auth not initialized. Call initWeb3Auth() first. Current status: " + (web3authInstance?.status || "null"),
    );
    console.error("[Web3Auth] ✗", error.message);
    throw error;
  }

  console.log("[Web3Auth] ✓ Returning initialized instance");
  return web3authInstance;
}

/**
 * Get Web3Auth instance, initializing if needed (for backward compatibility)
 */
export async function getOrInitWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] getOrInitWeb3Auth() called");
  if (web3authInstance?.status === "ready" || web3authInstance?.status === "connected") {
    console.log("[Web3Auth] Instance already ready, returning directly");
    return web3authInstance;
  }
  console.log("[Web3Auth] Instance not ready, calling initWeb3Auth()");
  return initWeb3Auth();
}

export function getWeb3AuthInstance(): Web3Auth | null {
  return web3authInstance;
}

export function getWeb3AuthProvider() {
  return web3authInstance?.provider || null;
}

export async function disconnectWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] disconnectWeb3Auth() called");
  console.log("[Web3Auth]   - Connected:", web3authInstance?.connected);
  if (web3authInstance?.connected) {
    console.log("[Web3Auth] Logging out...");
    await web3authInstance.logout();
    console.log("[Web3Auth] ✓ Logged out");
  }
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}
