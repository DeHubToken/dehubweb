/**
 * Web3Auth Configuration with Account Abstraction
 * =================================================
 * Web3Auth Modal SDK v10 for Base Mainnet with Pimlico-powered
 * Account Abstraction for gasless transactions.
 * 
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 */

import { 
  Web3Auth, 
  CHAIN_NAMESPACES, 
  WEB3AUTH_NETWORK,
  WALLET_CONNECTORS,
  AUTH_CONNECTION,
  CONFIRMATION_STRATEGY,
} from "@web3auth/modal";
import { supabase } from "@/integrations/supabase/client";

// Re-export for use in other files
export { WALLET_CONNECTORS, AUTH_CONNECTION };

// Auth connection type for TypeScript
export type AuthConnectionType = typeof AUTH_CONNECTION[keyof typeof AUTH_CONNECTION];

// Chain configuration for Base Mainnet
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x2105", // 8453 in hex
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
let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;

/**
 * Reset all Web3Auth module state - used for HMR and error recovery
 */
export function resetWeb3AuthState(): void {
  console.log("[Web3Auth] Resetting module state...");
  if (web3authInstance?.connected) {
    web3authInstance.logout().catch(() => {});
  }
  web3authInstance = null;
  isInitializing = false;
  initPromise = null;
  console.log("[Web3Auth] ✓ Module state reset");
}

// HMR cleanup - reset state when module is replaced during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log("[Web3Auth] HMR dispose - cleaning up...");
    resetWeb3AuthState();
  });
}

/**
 * Check if URL contains Web3Auth redirect parameters
 */
export function hasRedirectResult(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  return hash.includes('b64Params') || search.includes('b64Params');
}

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

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;
  console.log("[Web3Auth] Fetching Pimlico config from edge function...");
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  console.log("[Web3Auth] get-pimlico-config response:", { data, error });
  if (!error && data?.bundlerUrl && data?.paymasterUrl) {
    cachedPimlicoConfig = data;
    return cachedPimlicoConfig;
  }
  throw new Error("Pimlico API key not configured");
}

/**
 * Initialize Web3Auth with Account Abstraction via Pimlico
 * Configured for CUSTOM UI - no default modal shown
 */
export async function initWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] initWeb3Auth() called");
  console.log("[Web3Auth] Current instance:", web3authInstance ? "exists" : "null");
  console.log("[Web3Auth] Current status:", web3authInstance?.status || "N/A");

  // Return existing instance if ready
  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    console.log("[Web3Auth] Already initialized with status:", web3authInstance.status);
    return web3authInstance;
  }

  // Return pending initialization
  if (isInitializing && initPromise) {
    console.log("[Web3Auth] Already initializing, returning existing promise");
    return initPromise;
  }

  isInitializing = true;
  console.log("[Web3Auth] Starting initialization...");

  initPromise = (async () => {
    try {
      // Fetch configurations in parallel
      console.log("[Web3Auth] Fetching configurations...");
      const [clientId, pimlicoConfig] = await Promise.all([
        getWeb3AuthClientId(),
        getPimlicoConfig(),
      ]);
      console.log("[Web3Auth] ✓ Client ID fetched:", clientId?.substring(0, 15) + "...");
      console.log("[Web3Auth] ✓ Pimlico config fetched");

      // Create Web3Auth instance with custom UI configuration
      // Modal is hidden - we use connectTo() for direct provider access
      console.log("[Web3Auth] Creating Web3Auth instance with custom UI config...");
      web3authInstance = new Web3Auth({
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        // v10 Account Abstraction configuration
        accountAbstractionConfig: {
          smartAccountType: "safe",
          chains: [
            {
              chainId: "0x2105", // Base Mainnet
              bundlerConfig: {
                url: pimlicoConfig.bundlerUrl,
              },
              paymasterConfig: {
                url: pimlicoConfig.paymasterUrl,
              },
            },
          ],
        },
        // Use AA only for embedded wallets (social/email login)
        // External wallets like MetaMask will use their own accounts
        useAAWithExternalWallet: false,
        // Auto-approve signatures for auth messages (bypasses blocking modal)
        walletServicesConfig: {
          confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
          modalZIndex: 99999,
          whiteLabel: {
            showWidgetButton: false,
          },
        } as unknown as ConstructorParameters<typeof Web3Auth>[0]["walletServicesConfig"],
        // Custom UI configuration - we use our own modal
        uiConfig: {
          appName: "DeHub",
          mode: "dark",
          defaultLanguage: "en",
        },
      });
      console.log("[Web3Auth] ✓ Instance created with Account Abstraction");

      // Initialize
      console.log("[Web3Auth] Calling init()...");
      
      const initWithTimeout = Promise.race([
        web3authInstance.init(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Web3Auth init timeout")), 15000)
        )
      ]);
      
      await initWithTimeout;
      console.log("[Web3Auth] ✓ init() completed, status:", web3authInstance.status);
      console.log("[Web3Auth] Connected:", web3authInstance.connected);

      console.log("[Web3Auth] ✓ INITIALIZATION COMPLETE with Pimlico AA, status:", web3authInstance.status);
      return web3authInstance;
    } catch (error) {
      console.error("[Web3Auth] ✗ INITIALIZATION FAILED:", error);
      web3authInstance = null;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Connect to a specific social login provider using connectTo()
 * This bypasses the Web3Auth modal completely
 */
export async function connectToSocialProvider(
  authConnection: AuthConnectionType,
  loginHint?: string
): Promise<ReturnType<Web3Auth['connectTo']>> {
  const web3auth = await getOrInitWeb3Auth();
  
  console.log(`[Web3Auth] Connecting to ${authConnection}...`);
  
  const params: Record<string, unknown> = {
    authConnection,
  };
  
  // Add login hint for email/sms passwordless
  if (loginHint) {
    params.loginHint = loginHint;
  }
  
  const provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
  
  console.log(`[Web3Auth] ✓ Connected to ${authConnection}`);
  return provider;
}

/**
 * Connect to an external wallet (MetaMask, WalletConnect, etc.)
 */
export async function connectToExternalWallet(
  walletConnector: typeof WALLET_CONNECTORS[keyof typeof WALLET_CONNECTORS]
): Promise<ReturnType<Web3Auth['connectTo']>> {
  const web3auth = await getOrInitWeb3Auth();
  
  console.log(`[Web3Auth] Connecting to external wallet: ${walletConnector}...`);
  
  const provider = await web3auth.connectTo(walletConnector);
  
  console.log(`[Web3Auth] ✓ Connected to ${walletConnector}`);
  return provider;
}

/**
 * Connect using the default Web3Auth modal (fallback)
 */
export async function connectWithModal(): Promise<ReturnType<Web3Auth['connect']>> {
  const web3auth = await getOrInitWeb3Auth();
  
  console.log("[Web3Auth] Opening default modal...");
  const provider = await web3auth.connect();
  
  console.log("[Web3Auth] ✓ Connected via modal");
  return provider;
}

/**
 * Get the initialized Web3Auth instance
 */
export function getWeb3Auth(): Web3Auth {
  if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
    throw new Error("Web3Auth not initialized. Call initWeb3Auth() first.");
  }
  return web3authInstance;
}

/**
 * Get or initialize Web3Auth
 */
export async function getOrInitWeb3Auth(): Promise<Web3Auth> {
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
  console.log("[Web3Auth] disconnectWeb3Auth() called");
  if (web3authInstance?.connected) {
    await web3authInstance.logout();
    console.log("[Web3Auth] ✓ Logged out");
  }
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}
