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
  authConnector,
  UX_MODE,
} from "@web3auth/modal";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detect if running on a mobile device based on user agent
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

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
// Track which connector was last used (for detecting social login vs external wallet)
let lastConnectedConnector: string | null = null;

/**
 * Reset all Web3Auth module state - used for HMR and error recovery
 */
export function resetWeb3AuthState(): void {
  console.log("[Web3Auth] Resetting module state...");
  if (web3authInstance?.connected) {
    web3authInstance.logout().catch(() => { });
  }
  web3authInstance = null;
  isInitializing = false;
  initPromise = null;
  lastConnectedConnector = null;
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
      console.log("[Web3Auth] Is mobile device:", isMobileDevice());
      console.log("[Web3Auth] UX Mode:", isMobileDevice() ? "REDIRECT" : "POPUP");

      web3authInstance = new Web3Auth({
        clientId,
        chains: [chainConfig],
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
        // Configure connectors for mobile-aware email/SMS login
        connectors: [
          authConnector({
            connectorSettings: {
              uxMode: isMobileDevice() ? UX_MODE.REDIRECT : UX_MODE.POPUP,
              redirectUrl: window.location.origin,
            }
          })
        ],
        // Auto-approve signatures for auth messages (bypasses blocking modal)
        walletServicesConfig: {
          confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
          modalZIndex: 99999,
          loginMode: 'modal',
          whiteLabel: {
            showWidgetButton: false,
          },
        } as any,
        // Custom UI configuration - we use our own modal
        uiConfig: {
          appName: "DeHub",
          mode: "dark",
          defaultLanguage: "en",
        },
        enableLogging: true,
      } as any);
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
  console.log(`[Web3Auth] connectToSocialProvider: phase=INIT authConnection=${authConnection} loginHint=${loginHint ? 'set' : 'none'}`);

  let web3auth: Web3Auth;
  try {
    web3auth = await getOrInitWeb3Auth();
    console.log(`[Web3Auth] connectToSocialProvider: phase=READY status=${web3auth.status}`);
  } catch (err) {
    console.error(`[Web3Auth] connectToSocialProvider: phase=INIT_FAILED`, err);
    throw err;
  }

  const params: Record<string, unknown> = {
    authConnection,
  };

  // Add login hint for email/sms passwordless
  if (loginHint) {
    params.loginHint = loginHint;
  }

  let provider: ReturnType<Web3Auth['connectTo']> extends Promise<infer R> ? R : never;
  try {
    console.log(`[Web3Auth] connectToSocialProvider: phase=OAUTH calling connectTo(AUTH, ${JSON.stringify(params)})`);
    provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
    lastConnectedConnector = WALLET_CONNECTORS.AUTH; // Track that this was a social login
    console.log(`[Web3Auth] connectToSocialProvider: phase=OAUTH_OK provider=${provider ? 'received' : 'null'}`);
  } catch (err) {
    console.error(`[Web3Auth] connectToSocialProvider: phase=OAUTH_FAILED`, err);
    throw err;
  }

  console.log(`[Web3Auth] connectToSocialProvider: phase=AA_SETUP status=${web3auth.status} connected=${web3auth.connected}`);
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
  lastConnectedConnector = walletConnector; // Track that this was an external wallet

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
  try {
    if (web3authInstance?.connected) {
      await web3authInstance.logout();
      console.log("[Web3Auth] ✓ Logged out");
    }
  } catch (e) {
    console.warn("[Web3Auth] Logout error (continuing cleanup):", e);
  }
}

/**
 * Force cleanup Web3Auth after errors - aggressively removes all state
 * This handles the case where OAuth popup is closed mid-flow and SDK is stuck
 */
export async function forceCleanupWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] Force cleanup after error...");

  // Try to logout regardless of connection state - clears internal SDK state
  if (web3authInstance) {
    try {
      await web3authInstance.logout();
      console.log("[Web3Auth] ✓ Logged out during cleanup");
    } catch (e) {
      // Expected to fail if not connected, that's fine
      console.log("[Web3Auth] Logout during cleanup failed (expected):", e);
    }
  }

  // Clean up any leftover Web3Auth iframes/modals from the DOM
  const iframes = document.querySelectorAll('iframe[title*="web3auth"], iframe[id*="web3auth"], iframe[src*="web3auth"]');
  iframes.forEach(el => {
    console.log("[Web3Auth] Removing leftover iframe:", el);
    el.remove();
  });

  const modals = document.querySelectorAll('[class*="w3a-modal"], [class*="web3auth"], [id*="w3a-"]');
  modals.forEach(el => {
    console.log("[Web3Auth] Removing leftover modal element:", el);
    el.remove();
  });

  // Reset all module variables to allow fresh initialization
  web3authInstance = null;
  isInitializing = false;
  initPromise = null;

  // Pre-initialize a new instance so it's ready for the next connection attempt
  console.log("[Web3Auth] Pre-initializing new instance after cleanup...");
  try {
    await initWeb3Auth();
    console.log("[Web3Auth] ✓ New instance ready after cleanup");
  } catch (e) {
    console.warn("[Web3Auth] Pre-init after cleanup failed (will retry on connect):", e);
  }

  console.log("[Web3Auth] ✓ Force cleanup complete - ready for new connection");
}

/**
 * Safe reset after connection errors - ensures clean state for retry
 * @deprecated Use forceCleanupWeb3Auth instead
 */
export async function safeResetAfterError(): Promise<void> {
  return forceCleanupWeb3Auth();
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}

/**
 * Check if the current connection is via social login (Auth connector)
 * Used to determine signing method (private key vs provider)
 */
export function isSocialLoginConnected(): boolean {
  return lastConnectedConnector === WALLET_CONNECTORS.AUTH;
}

/**
 * Get the last connected connector name
 */
export function getLastConnectedConnector(): string | null {
  return lastConnectedConnector;
}

/**
 * Set the last connected connector (used when restoring session from redirect)
 */
export function setLastConnectedConnector(connector: string | null): void {
  lastConnectedConnector = connector;
}
