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
  Web3Auth,
  CHAIN_NAMESPACES,
  WEB3AUTH_NETWORK,
} from "@web3auth/modal";
import { supabase } from "@/integrations/supabase/client";

/**
 * Web3Auth Constants
 */
export const WALLET_CONNECTORS = {
  AUTH: "auth",
} as const;

export const AUTH_CONNECTION = {
  GOOGLE: "google",
  TWITTER: "twitter",
  APPLE: "apple",
  DISCORD: "discord",
  GITHUB: "github",
  TELEGRAM: "telegram",
  EMAIL_PASSWORDLESS: "email_passwordless",
  SMS_PASSWORDLESS: "sms_passwordless",
} as const;

export const UX_MODE = {
  POPUP: "popup",
  REDIRECT: "redirect",
} as const;

export const CONFIRMATION_STRATEGY = {
  AUTO_APPROVE: "auto_approve",
  NONE: "none",
} as const;

// Note: authConnector and other adapters should be configured via addAdapter/configureAdapter
// if using NoModal SDK, or they are included by default in the Modal SDK.

/**
 * Detect if running on a mobile device based on user agent + touch support.
 * iPadOS 13+ reports a desktop UA, so we also check maxTouchPoints.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  // 1. Standard mobile user-agent check (most reliable)
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  // 2. iPadOS 13+ reports macOS UA but has touch support
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  // 3. Small screen + touch = likely mobile
  // Many desktop laptops have touch, so we combined with screen width.
  const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (hasTouch && window.innerWidth <= 1024) {
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

// Re-export for use in other files - type only to avoid redeclaration error
// export type { WALLET_CONNECTORS, AUTH_CONNECTION, UX_MODE };
// Constants are already exported at the top of the file!

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
 * Pre-fetch configurations as soon as the module is loaded.
 */
function prewarmConfig() {
  if (typeof window === 'undefined') return;
  console.log("[Web3Auth] Pre-warming configurations...");
  getWeb3AuthClientId().catch(() => { });
  getPimlicoConfig().catch(() => { });
}

// Start pre-warming immediately
prewarmConfig();

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

async function fetchWithRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i > 0) console.log(`[Web3Auth] Retrying ${label} (attempt ${i + 1}/${maxRetries})...`);
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[Web3Auth] ${label} attempt ${i + 1} failed:`, err);
      // Wait before retry: 1s, 2s, 4s...
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw lastError;
}

async function getWeb3AuthClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  console.log("[Web3Auth] Fetching client ID from edge function...");

  return fetchWithRetry(async () => {
    const { data, error } = await supabase.functions.invoke("get-web3auth-config");
    console.log("[Web3Auth] get-web3auth-config response:", { data, error });
    if (!error && data?.clientId) {
      cachedClientId = data.clientId;
      return cachedClientId;
    }
    throw new Error(error?.message || "Web3Auth client ID not configured");
  }, "get-web3auth-config");
}

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;
  console.log("[Web3Auth] Fetching Pimlico config from edge function...");

  return fetchWithRetry(async () => {
    const { data, error } = await supabase.functions.invoke("get-pimlico-config");
    console.log("[Web3Auth] get-pimlico-config response:", { data, error });
    if (!error && data?.bundlerUrl && data?.paymasterUrl) {
      cachedPimlicoConfig = data;
      return cachedPimlicoConfig;
    }
    throw new Error(error?.message || "Pimlico config not configured");
  }, "get-pimlico-config");
}

/**
 * Initialize Web3Auth Modal v10 with Account Abstraction via Pimlico
 * Configured for CUSTOM UI - no default modal shown
 */
export async function initWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] initWeb3Auth() called");

  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    return web3authInstance;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      // Parallel fetch configs
      const [clientId, pimlicoConfig] = await Promise.all([
        getWeb3AuthClientId(),
        getPimlicoConfig(),
      ]);

      const mobile = isMobileDevice();
      const useRedirect = mobile || forceRedirectMode;

      web3authInstance = new Web3Auth({
        clientId,
        chains: [chainConfig],
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        sessionTime: 86400,
        uiConfig: {
          modalZIndex: "99999",
        } as any,
        accountAbstractionConfig: {
          smartAccountType: "safe",
          chains: [
            {
              chainId: "0x2105",
              bundlerConfig: { url: pimlicoConfig.bundlerUrl },
              paymasterConfig: { url: pimlicoConfig.paymasterUrl },
            },
          ],
        },
        useAAWithExternalWallet: false,
        walletServicesConfig: {
          confirmationStrategy: CONFIRMATION_STRATEGY.AUTO_APPROVE,
          modalZIndex: "99999",
          whiteLabel: { showWidgetButton: false },
        } as any,
      });

      await Promise.race([
        web3authInstance.init(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Web3Auth init timed out after 15s")), 15000)
        )
      ]);

      // Polling for ready state if stuck in not_ready
      if (web3authInstance.status === "not_ready") {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 250));
          if (web3authInstance.status !== "not_ready") break;
        }
      }

      if (web3authInstance.status === "not_ready") {
        throw new Error("Web3Auth stuck in not_ready state");
      }

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

function isPopupBlockedError(err: unknown): boolean {
  const combined = String(err).toLowerCase() + (err instanceof Error ? ' ' + String(err.cause).toLowerCase() : '');
  return (
    combined.includes('popup') && (combined.includes('blocked') || combined.includes('closed')) ||
    combined.includes('allow-popups') ||
    combined.includes('coop')
  );
}

export async function connectToSocialProvider(
  authConnection: AuthConnectionType,
  loginHint?: string
): Promise<ReturnType<Web3Auth['connectTo']>> {
  console.log(`[Web3Auth] connectToSocialProvider: ${authConnection}`);

  const web3auth = await getOrInitWeb3Auth();
  const mobile = isMobileDevice();
  const useRedirect = mobile || forceRedirectMode;
  const uxMode = useRedirect ? UX_MODE.REDIRECT : UX_MODE.POPUP;

  const params: any = {
    loginProvider: authConnection,
    uxMode,
    redirectUrl: window.location.origin + window.location.pathname,
    extraLoginOptions: {
      ux_mode: uxMode,
      redirect_url: window.location.origin + window.location.pathname,
    }
  };

  if (loginHint) params.loginHint = loginHint;

  savePreLoginPath();

  try {
    const provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, params);
    lastConnectedConnector = WALLET_CONNECTORS.AUTH;
    return provider;
  } catch (err) {
    if (isPopupBlockedError(err) && !forceRedirectMode) {
      console.warn('[Web3Auth] Popup blocked! Switching to REDIRECT mode...');
      forceRedirectMode = true;
      resetWeb3AuthState();
      const retryAuth = await initWeb3Auth();
      params.uxMode = UX_MODE.REDIRECT;
      params.extraLoginOptions.ux_mode = UX_MODE.REDIRECT;
      return await retryAuth.connectTo(WALLET_CONNECTORS.AUTH, params);
    }
    throw err;
  }
}

export function getWeb3Auth(): Web3Auth {
  if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
    throw new Error("Web3Auth not initialized");
  }
  return web3authInstance;
}

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
  if (web3authInstance?.connected && web3authInstance.provider) {
    return web3authInstance.provider;
  }
  return null;
}

export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) {
    await web3authInstance.logout();
  }
}

export async function forceCleanupWeb3Auth(): Promise<void> {
  console.log("[Web3Auth] Force cleanup...");
  if (web3authInstance) {
    try { await web3authInstance.logout(); } catch (e) { }
  }

  // Clean up iframes
  const iframes = document.querySelectorAll('iframe[title*="web3auth"], iframe[id*="web3auth"]');
  iframes.forEach(el => el.remove());

  web3authInstance = null;
  isInitializing = false;
  initPromise = null;

  // Proactive re-init
  initWeb3Auth().catch(() => { });
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}

export function isSocialLoginConnected(): boolean {
  return lastConnectedConnector === WALLET_CONNECTORS.AUTH;
}

export function getLastConnectedConnector(): string | null {
  return lastConnectedConnector;
}

export function setLastConnectedConnector(connector: string | null): void {
  lastConnectedConnector = connector;
}
