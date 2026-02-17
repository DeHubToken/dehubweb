/**
 * Web3Auth Configuration with Account Abstraction (v10 Modal SDK)
 * ================================================================
 * Web3Auth Modal SDK v10 for Base Mainnet with Pimlico-powered
 * Account Abstraction for gasless transactions.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 *
 * External wallets (MetaMask, WalletConnect, etc.) are handled by
 * Wagmi + Reown AppKit — NOT by Web3Auth.
 */

import {
  Web3AuthNoModal as Web3Auth,
  CHAIN_NAMESPACES,
  WEB3AUTH_NETWORK,
  WALLET_CONNECTORS,
  AUTH_CONNECTION,
  CONFIRMATION_STRATEGY,
  authConnector,
  UX_MODE,
} from "@web3auth/no-modal";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detect if running on a mobile device based on user agent + touch support.
 * iPadOS 13+ reports a desktop UA, so we also check maxTouchPoints.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  // 1. Check screen width - if it's small, it's effectively a mobile view regardless of UA
  if (window.innerWidth <= 1024) return true;

  // 2. Standard mobile user-agent check
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    return true;
  }
  // 3. iPadOS 13+ reports macOS UA but has touch support
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  // 4. Fallback: has touch support
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    return true;
  }
  return false;
}

/**
 * Detect if running inside a wallet's in-app browser.
 * Wallet browsers inject window.ethereum and have distinctive user agents.
 */
export function isWalletInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const hasEthereum = !!(window as any).ethereum;

  // Check known wallet in-app browser UA strings
  const walletUAs = [
    'metamask',        // MetaMask mobile browser
    'trust',           // Trust Wallet
    'trustwallet',
    'coinbasebrowser', // Coinbase Wallet browser
    'coinbase',
    'phantom',         // Phantom
    'tokenpocket',
    'imtoken',
    'bitkeep',
    'okex',            // OKX Wallet
    'okapp',
  ];
  const isKnownWalletUA = walletUAs.some(w => ua.includes(w));

  // If we're on mobile with window.ethereum injected, it's very likely a wallet browser
  // even if UA doesn't match (some wallets use generic Chrome UA)
  if (isMobileDevice() && hasEthereum) return true;
  if (isKnownWalletUA && hasEthereum) return true;

  return false;
}

/**
 * Get the name of the detected wallet in-app browser (for display purposes)
 */
export function getWalletBrowserName(): string | null {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  const ethereum = (window as any).ethereum;
  if (!ethereum) return null;

  if (ethereum.isMetaMask) return 'MetaMask';
  if (ethereum.isTrust || ua.includes('trust')) return 'Trust Wallet';
  if (ethereum.isCoinbaseWallet || ua.includes('coinbasebrowser')) return 'Coinbase Wallet';
  if (ethereum.isPhantom || ua.includes('phantom')) return 'Phantom';
  if (ua.includes('tokenpocket')) return 'TokenPocket';

  // Generic fallback - we know it's a wallet browser but can't identify which
  if (isMobileDevice() && ethereum) return 'Wallet';
  return null;
}

// Re-export for use in other files
export { WALLET_CONNECTORS, AUTH_CONNECTION };

// Auth connection type for TypeScript
export type AuthConnectionType = typeof AUTH_CONNECTION[keyof typeof AUTH_CONNECTION];

// Chain configuration for Base Mainnet
// Note: Using publicnode.com RPC - mainnet.base.org returns 403 errors
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x2105", // 8453 in hex
  rpcTarget: "https://base-rpc.publicnode.com",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://basescan.org/assets/base/images/svg/logos/chain-light.svg?v=25.1.2.0",
};

let web3authInstance: Web3Auth | null = null;
let isInitializing = false;
let initPromise: Promise<Web3Auth> | null = null;
// Track which connector was last used (for detecting social login vs external wallet)
let lastConnectedConnector: string | null = null;
// Track if we've detected that popups are blocked and should use redirect
let forceRedirectMode = false;

// Cached configs from edge functions
let cachedClientId: string | null = null;
let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;

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
  // Don't reset cached configs or forceRedirectMode - persist across resets
  console.log("[Web3Auth] Module state reset");
}

// HMR cleanup - reset state when module is replaced during development
// @ts-ignore
if (import.meta.hot) {
  // @ts-ignore
  import.meta.hot.dispose(() => {
    console.log("[Web3Auth] HMR dispose - cleaning up...");
    resetWeb3AuthState();
  });
}

/**
 * Save the current path before mobile redirect so we can restore it after auth.
 */
export function savePreLoginPath(): void {
  const currentPath = window.location.pathname + window.location.search;
  sessionStorage.setItem('dehub_pre_login_path', currentPath);
  console.log('[Web3Auth] Saved pre-login path:', currentPath);
}

/**
 * Get and clear the saved pre-login path (consumed once after redirect).
 */
export function consumePreLoginPath(): string | null {
  const path = sessionStorage.getItem('dehub_pre_login_path');
  if (path) {
    sessionStorage.removeItem('dehub_pre_login_path');
    console.log('[Web3Auth] Consumed pre-login path:', path);
  }
  return path;
}

/**
 * Check if URL contains Web3Auth redirect parameters.
 * Web3Auth v10 may attach params in hash OR search.
 */
export function hasRedirectResult(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  const combined = hash + search;
  return (
    combined.includes('b64Params') ||
    combined.includes('sessionId') ||
    combined.includes('sessionNamespace')
  );
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
 * Initialize Web3Auth Modal v10 with Account Abstraction via Pimlico
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
      console.log("[Web3Auth] Client ID fetched:", clientId?.substring(0, 15) + "...");
      console.log("[Web3Auth] Pimlico config fetched");

      // Determine UX mode based on device
      const mobile = isMobileDevice();
      const useRedirect = mobile || forceRedirectMode;
      console.log("[Web3Auth] Is mobile device:", mobile);
      console.log("[Web3Auth] UX Mode:", useRedirect ? "REDIRECT" : "POPUP");
      console.log("[Web3Auth] forceRedirect:", forceRedirectMode);

      // Create Web3Auth instance with      // Use modal: false to bypass Web3Auth modal UI
      // Modal is hidden - we use connectTo() for direct provider access
      console.log("[Web3Auth] Creating Web3Auth v10 instance (AA ENABLED - will deploy on first login)...");

      web3authInstance = new Web3Auth({
        clientId,
        chains: [chainConfig],
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        sessionTime: 86400,
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
        useAAWithExternalWallet: false,
        connectors: [
          authConnector({
            connectorSettings: {
              uxMode: useRedirect ? UX_MODE.REDIRECT : UX_MODE.POPUP,
              redirectUrl: window.location.origin + window.location.pathname,
            }
          })
        ],
        walletServicesConfig: {
          confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
          modalZIndex: 99999,
          whiteLabel: {
            showWidgetButton: false,
          },
        } as unknown as ConstructorParameters<typeof Web3Auth>[0]["walletServicesConfig"],
      });
      console.log("[Web3Auth] Instance created (NO-MODAL SDK)");

      // Initialize
      console.log("[Web3Auth] Calling init()...");
      await web3authInstance.init();
      console.log("[Web3Auth] init() resolved, status:", web3authInstance.status);

      // On some mobile devices/networks, status might stay 'not_ready' for a few ms
      // while it processes metadata or analytics failures. Wait for transition.
      for (let i = 0; i < 40; i++) { // Wait up to 10 seconds
        await new Promise(r => setTimeout(r, 250));
        if (web3authInstance.status !== "not_ready") {
          console.log(`[Web3Auth] Status transitioned to ${web3authInstance.status} after ${i * 250}ms`);
          break;
        }
      }
      // If still not ready but we have redirect params, try a hard init() fallback
      if (web3authInstance.status === "not_ready" && hasRedirectResult()) {
        console.warn("[Web3Auth] Still not_ready on redirect page, attempting init() fallback...");
        try {
          await (web3authInstance as any).init();
          console.log("[Web3Auth] init() fallback resolved, status:", web3authInstance.status);
        } catch (e) {
          console.error("[Web3Auth] init() fallback failed:", e);
        }
      }

      console.log("[Web3Auth] INITIALIZATION FINISHED, final status:", web3authInstance.status, "Connected:", web3authInstance.connected);
      return web3authInstance;
    } catch (error) {
      console.error("[Web3Auth] INITIALIZATION FAILED:", error);
      web3authInstance = null;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Check if an error is a popup-blocked error.
 * Web3Auth wraps the real error in a WalletLoginError, so we need to
 * check the full error chain (message + cause + string representation).
 */
function isPopupBlockedError(err: unknown): boolean {
  // Build a combined string from the error + its cause chain
  let combined = '';
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      combined += ' ' + current.message;
      current = (current as any).cause;
    } else {
      combined += ' ' + String(current);
      break;
    }
  }
  // Also check toString() which often includes "Caused by:"
  combined += ' ' + String(err);
  const lower = combined.toLowerCase();
  return (
    (lower.includes('popup') && (lower.includes('blocked') || lower.includes('closed'))) ||
    lower.includes('allow-popups') ||
    lower.includes('sandboxed frame')
  );
}

/**
 * Connect to a specific social login provider using connectTo()
 * This bypasses the Web3Auth modal completely - direct provider connection.
 * If popup is blocked, automatically switches to REDIRECT mode and retries.
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

  // Determine UX mode based on device (match initWeb3Auth logic)
  const mobile = isMobileDevice();
  const useRedirect = mobile || forceRedirectMode;

  const params: Record<string, unknown> = {
    authConnection,
    uxMode: useRedirect ? UX_MODE.REDIRECT : UX_MODE.POPUP,
  };

  // For redirect mode, must explicitly pass redirectUrl in connectTo params
  if (useRedirect) {
    params.redirectUrl = window.location.origin + window.location.pathname;
  }

  // Add login hint for email/sms passwordless
  if (loginHint) {
    params.loginHint = loginHint;
  }

  // Save current path before potential redirect
  savePreLoginPath();

  let provider: Awaited<ReturnType<Web3Auth['connectTo']>>;
  try {
    console.log(`[Web3Auth] connectToSocialProvider: phase=CONNECT calling connectTo(${WALLET_CONNECTORS.AUTH}, { authConnection: ${authConnection} })`);
    provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
    lastConnectedConnector = WALLET_CONNECTORS.AUTH;
    console.log(`[Web3Auth] connectToSocialProvider: phase=CONNECT_OK provider=${provider ? 'received' : 'null'}`);
  } catch (err) {
    // If popup was blocked, switch to REDIRECT mode and retry automatically
    if (isPopupBlockedError(err) && !forceRedirectMode) {
      console.warn('[Web3Auth] Popup blocked! Switching to REDIRECT mode and retrying...');
      forceRedirectMode = true;

      // Re-initialize with REDIRECT mode
      web3authInstance = null;
      isInitializing = false;
      initPromise = null;

      web3auth = await initWeb3Auth();

      console.log('[Web3Auth] Re-initialized with REDIRECT mode, retrying connectTo...');
      // Ensure redirectUrl is in params for the retry
      params.uxMode = UX_MODE.REDIRECT;
      params.redirectUrl = window.location.origin + window.location.pathname;
      // This will redirect the browser (won't return on mobile)
      provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
      lastConnectedConnector = WALLET_CONNECTORS.AUTH;
      console.log(`[Web3Auth] connectToSocialProvider: phase=REDIRECT_CONNECT_OK`);
    } else {
      console.error(`[Web3Auth] connectToSocialProvider: phase=CONNECT_FAILED`, err);
      throw err;
    }
  }

  console.log(`[Web3Auth] connectToSocialProvider: phase=DONE status=${web3auth.status} connected=${web3auth.connected}`);
  console.log(`[Web3Auth] Connected to ${authConnection}`);
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
  // Only return provider if user actually authenticated through Web3Auth
  // .provider exists after init() even for non-Web3Auth users
  if (web3authInstance?.connected && web3authInstance.provider) {
    return web3authInstance.provider;
  }
  return null;
}

export async function disconnectWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] disconnectWeb3Auth() called");
  try {
    if (web3authInstance?.connected) {
      await web3authInstance.logout();
      console.log("[Web3Auth] Logged out");
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
      console.log("[Web3Auth] Logged out during cleanup");
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
    console.log("[Web3Auth] New instance ready after cleanup");
  } catch (e) {
    console.warn("[Web3Auth] Pre-init after cleanup failed (will retry on connect):", e);
  }

  console.log("[Web3Auth] Force cleanup complete - ready for new connection");
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
 * Check if the current connection is via social login (AUTH connector)
 * Used to determine signing method in AuthContext
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
