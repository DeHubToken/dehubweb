/**
 * Web3Auth Configuration (v10 Modal SDK) with Account Abstraction
 * ===============================================================
 * Web3Auth Modal SDK v10 for Base Mainnet with Pimlico AA.
 * AA is used for on-chain transactions; auth signing uses standard ECDSA.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing the default Web3Auth modal.
 *
 * External wallets (MetaMask, Rabby, Phantom, Trust) are handled by
 * Wagmi — NOT by Web3Auth.
 */

import {
  Web3Auth,
  CHAIN_NAMESPACES,
  WEB3AUTH_NETWORK,
} from "@web3auth/modal";
import { AccountAbstractionProvider, SafeSmartAccount } from "@web3auth/account-abstraction-provider";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import type { IProvider } from "@web3auth/base";
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
  const win = window as any;
  const hasEthereum = !!win.ethereum;
  // Phantom injects window.phantom.ethereum in BOTH its mobile DApp browser and its desktop
  // extension. Only treat it as an in-app browser when we're actually on mobile — otherwise
  // a desktop user with the Phantom extension installed is incorrectly flagged as in-app.
  const hasPhantomEthereum = !!win.phantom?.ethereum;
  if (hasPhantomEthereum && isMobileDevice()) return true;

  // Check known wallet in-app browser UA strings
  const walletUAs = [
    'metamask',        // MetaMask mobile browser
    'rabby',           // Rabby mobile browser
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

/**
 * Generate a universal link to open the current site inside a wallet's in-app browser.
 * Uses universal/app links (https://) instead of custom URI schemes (wallet://)
 * because universal links are more reliable on iOS Safari and Android Chrome.
 * - If the wallet app is installed → OS opens the wallet app directly
 * - If not installed → redirects to Play Store / App Store
 */
export function getWalletDeepLink(wallet: string, targetUrl?: string): string | null {
  if (typeof window === 'undefined') return null;

  const url = targetUrl || window.location.href;
  const encodedUrl = encodeURIComponent(url);
  const domainAndPath = url.replace(/^https?:\/\//, '');
  const ref = encodeURIComponent(window.location.origin);

  switch (wallet.toLowerCase()) {
    case 'metamask':
      // Universal link - opens dapp in MetaMask in-app browser (iOS + Android)
      return `https://metamask.app.link/dapp/${domainAndPath}`;
    case 'phantom':
      // Phantom Browse: https://phantom.app/ul/browse/<url>?ref=<ref>
      // Opens dapp in Phantom in-app browser - same flow as MetaMask
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${ref}`;
    case 'coinbase':
      return `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`;
    case 'trust':
      return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedUrl}`;
    case 'rabby':
      // Rabby has no official deep link (rabby.io/dapp returns 404).
      // Return null so we use connect() → RainbowKit WalletConnect flow on mobile.
      return null;
    default:
      return null;
  }
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
let storedAAProvider: any = null;
let pendingAASetupPromise: Promise<any | null> | null = null;
// Per-chain AA provider cache for multi-chain support (e.g. BNB)
const storedChainAAProviders = new Map<number, any>();

// Chain configs for multi-chain AA setup
const AA_CHAIN_CONFIGS: Record<number, {
  chainIdHex: string;
  rpcTarget: string;
  displayName: string;
  blockExplorerUrl: string;
  ticker: string;
  tickerName: string;
}> = {
  8453: {
    chainIdHex: "0x2105",
    rpcTarget: "https://base-rpc.publicnode.com",
    displayName: "Base Mainnet",
    blockExplorerUrl: "https://basescan.org",
    ticker: "ETH",
    tickerName: "Ethereum",
  },
  56: {
    chainIdHex: "0x38",
    rpcTarget: "https://bsc-dataseed.binance.org",
    displayName: "BNB Smart Chain",
    blockExplorerUrl: "https://bscscan.com",
    ticker: "BNB",
    tickerName: "BNB",
  },
};
// Track which connector was last used (for detecting social login vs external wallet)
let lastConnectedConnector: string | null = null;
// Track if we've detected that popups are blocked and should use redirect
let forceRedirectMode = false;

// Cached configs from edge functions
let cachedClientId: string | null = null;
let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;

/**
 * Clear Web3Auth/Torus persisted session from storage to prevent stale "connected" state.
 *
 * IMPORTANT: 'auth_store' MUST be in this list.
 * @web3auth/auth stores the Sapphire sessionId under localStorage key "auth_store"
 * (via BrowserStorage with _storageBaseKey = "auth_store"). Without clearing this,
 * the next Auth.init() will find the old sessionId, contact the Sapphire server,
 * restore the old session (Google's privKey), and all subsequent logins with ANY
 * provider will return the SAME private key as the first login — session bleeding.
 */
function clearWeb3AuthStorage(): void {
  if (typeof window === 'undefined') return;
  const prefixes = ['torus', 'web3auth', 'tkey', 'openlogin', 'auth_store'];
  // Exclude our own custom dehub_* keys — they contain 'web3auth' as a substring
  // (e.g. 'dehub_web3auth_client_id') and would be wrongly cleared by the prefix check.
  const excludePrefixes = ['dehub_'];
  for (const storage of [localStorage, sessionStorage]) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const lk = key.toLowerCase();
      if (excludePrefixes.some(p => lk.startsWith(p))) continue;
      if (prefixes.some(p => lk.includes(p))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => storage.removeItem(k));
    if (keysToRemove.length) {
      console.log('[Web3Auth] Cleared storage keys:', keysToRemove);
    }
  }
}

/**
 * Remove Web3Auth's injected wallet button/widget from the DOM.
 * Also ensures no injected element blocks page scrolling.
 */
export function removeWeb3AuthWalletButton(): void {
  if (typeof document === 'undefined') return;
  // Remove wallet button elements
  const selectors = [
    '.w3a-wallet-button',
    '[class*="wallet-button"]',
    '#w3a-wallet-widget',
    '[id*="wallet-widget"]',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => el.remove());
  }
  // Ensure body scroll is not blocked by Web3Auth
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.documentElement.style.overflow = '';
}

/**
 * Watch for Web3Auth injected wallet button and remove it immediately.
 * Uses MutationObserver so it catches async injections after login.
 */
let walletButtonObserver: MutationObserver | null = null;
export function startWalletButtonCleanup(): void {
  if (typeof document === 'undefined' || walletButtonObserver) return;
  walletButtonObserver = new MutationObserver(() => {
    removeWeb3AuthWalletButton();
  });
  walletButtonObserver.observe(document.body, { childList: true, subtree: true });
  // Also clean up immediately
  removeWeb3AuthWalletButton();
}

/**
 * Properly invalidate the Auth (openlogin) session — bypasses the connector's status check.
 *
 * The outer web3auth.logout({ cleanup: true }) fails when the connector is "not connected"
 * (e.g. after WsEmbed throws 400). But the Auth class itself only checks sessionManager.sessionId
 * which IS set after a successful DKG. So we can call logout() directly on authInstance.
 *
 * This also clears BrowserStorage.instanceMap — a static module-level Map that caches
 * BrowserStorage instances. Without clearing it, the next Auth.init() reuses the same
 * BrowserStorage instance (which might still have in-memory/MemoryStore data).
 */
async function clearAuthInstance(authInstance: any): Promise<void> {
  if (!authInstance) return;
  // 1. Invalidate the Sapphire server-side session and clear authInstance.state
  try {
    await authInstance.logout();
    console.log('[Web3Auth] authInstance.logout() succeeded — Sapphire session invalidated');
  } catch (e) {
    // May throw "userNotLoggedIn" if sessionId is already cleared — that's fine.
    // Fallback: manually wipe the in-memory state.
    try { authInstance.state = {}; } catch {}
    console.warn('[Web3Auth] authInstance.logout() failed, state cleared manually:', String(e).slice(0, 80));
  }
  // 2. Clear BrowserStorage.instanceMap so the next Auth.init() creates a fresh instance.
  //    BrowserStorage uses a static Map to cache instances by key ('auth_store').
  //    Without clearing it, new Auth objects reuse the old BrowserStorage instance.
  //    (When localStorage is unavailable, a MemoryStore is used — clearing instanceMap
  //    ensures even in-memory sessions are dropped.)
  try {
    const BrowserStorageClass = authInstance.currentStorage?.constructor;
    if (BrowserStorageClass?.instanceMap instanceof Map) {
      BrowserStorageClass.instanceMap.clear();
      console.log('[Web3Auth] BrowserStorage.instanceMap cleared');
    }
  } catch {}
}

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
  clearWeb3AuthStorage();
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
let pendingPimlicoFetch: Promise<{ bundlerUrl: string; paymasterUrl: string }> | null = null;

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;
  
  // Check sessionStorage first to survive HMR/reloads without re-fetching
  const stored = sessionStorage.getItem('dehub_pimlico_config');
  if (stored) {
    try {
      cachedPimlicoConfig = JSON.parse(stored);
      return cachedPimlicoConfig;
    } catch {}
  }

  // Deduplicate in-flight requests
  if (pendingPimlicoFetch) return pendingPimlicoFetch;
  
  pendingPimlicoFetch = fetchWithRetry(async () => {
    const { data, error } = await supabase.functions.invoke("get-pimlico-config");
    if (!error && data?.bundlerUrl && data?.paymasterUrl) {
      cachedPimlicoConfig = data;
      sessionStorage.setItem('dehub_pimlico_config', JSON.stringify(data));
      return cachedPimlicoConfig;
    }
    throw new Error(error?.message || "Pimlico config not configured");
  }, "get-pimlico-config").finally(() => { pendingPimlicoFetch = null; });

  return pendingPimlicoFetch;
}

function prewarmConfig() {
  if (typeof window === 'undefined') return;
  // Skip if both configs are already in sessionStorage
  if (sessionStorage.getItem('dehub_web3auth_client_id') && sessionStorage.getItem('dehub_pimlico_config')) {
    console.log("[Web3Auth] Configs already cached in sessionStorage, skipping prewarm");
    cachedClientId = sessionStorage.getItem('dehub_web3auth_client_id')!;
    try { cachedPimlicoConfig = JSON.parse(sessionStorage.getItem('dehub_pimlico_config')!); } catch {}
    return;
  }
  console.log("[Web3Auth] Pre-warming configurations...");
  Promise.all([
    getWeb3AuthClientId().catch(() => {}),
    getPimlicoConfig().catch(() => {}),
  ]);
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
      // Shorter retry delays: 500ms, 1s, 2s
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 500));
    }
  }
  throw lastError;
}

let pendingClientIdFetch: Promise<string> | null = null;

async function getWeb3AuthClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  
  // Check sessionStorage first to survive HMR/reloads without re-fetching
  const stored = sessionStorage.getItem('dehub_web3auth_client_id');
  if (stored) {
    cachedClientId = stored;
    return cachedClientId;
  }
  
  // Deduplicate in-flight requests
  if (pendingClientIdFetch) return pendingClientIdFetch;

  console.log("[Web3Auth] Fetching client ID from edge function...");

  pendingClientIdFetch = fetchWithRetry(async () => {
    const { data, error } = await supabase.functions.invoke("get-web3auth-config");
    console.log("[Web3Auth] get-web3auth-config response:", { data, error });
    if (!error && data?.clientId) {
      cachedClientId = data.clientId;
      sessionStorage.setItem('dehub_web3auth_client_id', data.clientId);
      return cachedClientId;
    }
    throw new Error(error?.message || "Web3Auth client ID not configured");
  }, "get-web3auth-config").finally(() => { pendingClientIdFetch = null; });

  return pendingClientIdFetch;
}

function isRetryableInitError(err: unknown): boolean {
  const msg = String(err).toLowerCase() + (err instanceof Error ? ' ' + String((err as any).cause || '').toLowerCase() : '');
  return (
    msg.includes('failed to fetch') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('project configurations') ||
    msg.includes('network') ||
    msg.includes('timed out')
  );
}

/**
 * Initialize Web3Auth Modal v10 with Account Abstraction.
 * Retries with backoff on 429/rate limit/fetch errors.
 */
export async function initWeb3Auth(): Promise<Web3Auth> {
  console.log("[Web3Auth] initWeb3Auth() called");

  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    return web3authInstance;
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  const INIT_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 8000]; // 2s, 4s, 8s (faster recovery on retry)

  isInitializing = true;
  initPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < INIT_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Web3Auth] Retry ${attempt}/${INIT_RETRIES - 1} after rate limit/fetch error...`);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        }

        const clientId = await getWeb3AuthClientId();

        // accountAbstractionConfig is intentionally omitted — it causes the internal
        // EthereumController (AbstractTorusController) to call POST api-wallet.web3auth.io/auth/verify
        // with a Safe smart account signature that is > 500 chars, which Web3Auth's own server
        // rejects with 400. This makes login completely fail. Removing AA config restores login
        // using standard EOA. Re-add once Web3Auth fixes their server-side signature length limit.
        const initOptions: any = {
          clientId,
          chains: [chainConfig],
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
          sessionTime: 86400,
          uiConfig: { modalZIndex: "99999" } as any,
          walletServicesConfig: { whiteLabel: { showWidgetButton: false } },
        };

        web3authInstance = new Web3Auth(initOptions);
        
        await Promise.race([
          web3authInstance.init(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Web3Auth init timed out after 30s")), 30000)
          )
        ]);

        // Remove any injected wallet button/widget that blocks scrolling
        removeWeb3AuthWalletButton();

        if (web3authInstance.status === "not_ready") {
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (web3authInstance.status !== "not_ready") break;
          }
        }

        if (web3authInstance.status === "not_ready") {
          throw new Error("Web3Auth stuck in not_ready state");
        }

        return web3authInstance;
      } catch (error) {
        lastError = error;
        console.error(`[Web3Auth] INITIALIZATION FAILED (attempt ${attempt + 1}/${INIT_RETRIES}):`, error);
        web3authInstance = null;

        if (attempt < INIT_RETRIES - 1 && isRetryableInitError(error)) {
          console.warn(`[Web3Auth] Will retry in ${RETRY_DELAYS[attempt] / 1000}s (rate limit / fetch error)`);
        } else {
          throw error;
        }
      }
    }
    throw lastError;
  })().finally(() => {
    isInitializing = false;
  });

  return initPromise;
}

function isPopupBlockedError(err: unknown): boolean {
  const combined = String(err).toLowerCase() + (err instanceof Error ? ' ' + String((err as any).cause).toLowerCase() : '');
  return (
    combined.includes('popup') && (combined.includes('blocked') || combined.includes('closed')) ||
    combined.includes('allow-popups') ||
    combined.includes('coop')
  );
}

/**
 * Returns OAuth provider-specific options to force account selection / re-login.
 * Without these, cached OAuth cookies cause silent auto-login with the last used account.
 */
function getProviderForceLoginOptions(authConnection: AuthConnectionType): Record<string, string> {
  switch (authConnection) {
    case AUTH_CONNECTION.GOOGLE:
      // Forces Google account picker even when the user has an active Google session
      return { prompt: 'select_account' };
    case AUTH_CONNECTION.TWITTER:
      // Forces Twitter re-authentication screen
      return { force_login: 'true' };
    case AUTH_CONNECTION.DISCORD:
    case AUTH_CONNECTION.GITHUB:
    case AUTH_CONNECTION.APPLE:
      // Generic OAuth prompt=login forces re-auth for these providers
      return { prompt: 'login' };
    default:
      // EMAIL_PASSWORDLESS, SMS_PASSWORDLESS, TELEGRAM — no forced re-auth needed
      return {};
  }
}

export async function connectToSocialProvider(
  authConnection: AuthConnectionType,
  loginHint?: string,
  skipConnectedCheck = false
): Promise<ReturnType<Web3Auth['connectTo']>> {
  // Log partial hint (last 10 chars) so we can verify same-vs-different account in console
  const hintDebug = loginHint ? `hint=...${loginHint.slice(-10)}` : 'no-hint';
  console.log(`[Web3Auth] connectToSocialProvider: ${authConnection} (${hintDebug})`);

  const web3auth = await getOrInitWeb3Auth();

  // If a previous failed session left Web3Auth in "connected" state, logout first.
  // Otherwise connectTo throws "Already connected".
  // skipConnectedCheck: set on retry after reset to avoid infinite loop (new instance may restore stale session)
  if (!skipConnectedCheck && web3auth.connected) {
    console.log('[Web3Auth] Already connected - logging out before new auth attempt...');
    try {
      await web3auth.logout();
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn('[Web3Auth] Pre-connect logout failed - forcing full reset:', e);
      resetWeb3AuthState();
      await new Promise(r => setTimeout(r, 1000));
      return connectToSocialProvider(authConnection, loginHint, true);
    }
  }

  const mobile = isMobileDevice();
  const useRedirect = mobile || forceRedirectMode;
  const uxMode = useRedirect ? UX_MODE.REDIRECT : UX_MODE.POPUP;

  // v10 API: `authConnection` replaced `loginProvider`; uxMode/redirectUrl are top-level.
  // email/phone hint goes in extraLoginOptions.login_hint (underscore), not top-level loginHint.
  const params: any = {
    authConnection: authConnection,
    uxMode,
    redirectUrl: window.location.origin + window.location.pathname,
  };

  // Always pass provider-specific options to force the account picker / re-login screen.
  // This prevents silent auto-login with a cached OAuth session from a previous login.
  const forceLoginOptions = getProviderForceLoginOptions(authConnection);
  params.extraLoginOptions = {
    ...forceLoginOptions,
    ...(loginHint ? { login_hint: loginHint } : {}),
  };

  savePreLoginPath();

  // Pre-flight: clear any stale openlogin/Auth session before starting a new OAuth flow.
  // Does NOT clear our custom dehub_* keys (pimlico config, client ID, wallet address).
  if (!skipConnectedCheck) {
    const authConnector = (web3auth as any).connectors?.find((c: any) => c.name === WALLET_CONNECTORS.AUTH);
    if (authConnector) {
      // 1. Try connector-level disconnect (may fail if connector is "not connected")
      try {
        await authConnector.disconnect?.();
        console.log('[Web3Auth] Pre-flight: auth connector disconnected');
      } catch (connErr) {
        console.warn('[Web3Auth] Pre-flight: auth connector disconnect failed (non-blocking):', String(connErr).slice(0, 80));
      }
      // 2. Directly call authInstance.logout() to invalidate the Sapphire session.
      //    This bypasses the connector's status check which rejects "not connected" instances.
      //    Auth.logout() only requires sessionManager.sessionId to be set — which it is
      //    after a successful DKG even when the overall connectTo() threw.
      if (authConnector.authInstance) {
        await clearAuthInstance(authConnector.authInstance);
      }
    }
    // 3. Clear localStorage — includes 'auth_store' (the @web3auth/auth session key)
    clearWeb3AuthStorage();
  }

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
      return await retryAuth.connectTo(WALLET_CONNECTORS.AUTH, params);
    }

    // Web3Auth Modal v10 bundles WsEmbed (Torus wallet) for EIP155 chains.
    // WsEmbed calls api-wallet.web3auth.io/auth/verify which rejects signatures > 500 chars.
    // BUT key reconstruction via Sapphire DKG completes BEFORE loginWithSessionId is called.
    // So even when connectTo() throws, authInstance.privKey has the reconstructed private key.
    // We recover it here to build our own EIP1193 provider, bypassing WsEmbed entirely.
    const privKey = extractPrivKeyFromConnector(web3auth);
    if (privKey) {
      console.log('[Web3Auth] WsEmbed auth/verify failed — recovering via private key (privKey length:', privKey.length, ')');

      // CRITICAL: Properly clear the Auth session BEFORE nulling web3authInstance.
      //
      // Root cause of session bleeding:
      // - Auth.login() stores the sessionId in localStorage under key "auth_store"
      //   (via BrowserStorage with _storageBaseKey = "auth_store")
      // - Auth.login() also stores privKey/userInfo in authInstance.state (in-memory)
      // - BrowserStorage uses a static instanceMap (module-level Map) that caches
      //   instances across Auth object recreations
      //
      // Without proper cleanup:
      // - The next Auth.init() reads "auth_store" from localStorage → finds old sessionId
      // - Contacts Sapphire server → restores old session (Google's privKey)
      // - connectTo('twitter') silently reuses Google's session → same address every time
      //
      // Fix: call authInstance.logout() directly (bypasses connector status check) +
      //      clear BrowserStorage.instanceMap + clear localStorage 'auth_store' key.
      const authConnector = (web3auth as any).connectors?.find((c: any) => c.name === WALLET_CONNECTORS.AUTH);
      if (authConnector?.authInstance) {
        await clearAuthInstance(authConnector.authInstance);
      }

      web3authInstance = null;
      isInitializing = false;
      initPromise = null;
      clearWeb3AuthStorage();
      const eoaProvider = await buildProviderFromPrivKey(privKey);
      lastConnectedConnector = WALLET_CONNECTORS.AUTH;
      return eoaProvider;
    }

    throw err;
  }
}

/**
 * Extract the reconstructed private key from the auth connector's authInstance.
 * This is available after OAuth + Sapphire DKG completes even if WsEmbed loginWithSessionId fails.
 */
function extractPrivKeyFromConnector(w3a: Web3Auth): string | null {
  try {
    const connector = (w3a as any).connectedConnector
      || (w3a as any).connectors?.find((c: any) => c.name === WALLET_CONNECTORS.AUTH);
    const authInstance = connector?.authInstance;

    // DIAGNOSTIC: log verifier info to detect same-email vs actual session bleeding
    // If typeOfLogin + verifierId are the same across two different providers,
    // the user is logging in with the same identity (e.g. same email for Google + email_passwordless).
    // That gives the same private key by design — it's NOT a bug.
    const typeOfLogin = authInstance?.metaData?.typeOfLogin ?? authInstance?.typeOfLogin ?? 'unknown';
    const verifierId = authInstance?.metaData?.verifierId ?? authInstance?.verifierId ?? 'unknown';
    const verifier = authInstance?.aggregateVerifier ?? authInstance?.verifier ?? 'unknown';
    console.log(
      '[Web3Auth] extractPrivKey: typeOfLogin=', typeOfLogin,
      'verifier=', verifier,
      'verifierId (last 12)=', typeof verifierId === 'string' ? `...${verifierId.slice(-12)}` : verifierId,
    );

    const privKey = authInstance?.privKey || authInstance?.coreKitKey;
    return privKey && privKey.length >= 32 ? privKey : null;
  } catch {
    return null;
  }
}

/**
 * Build a full Ethereum-compatible IProvider from a raw hex private key.
 * Uses EthereumPrivateKeyProvider which implements eth_accounts, personal_sign, etc.
 * Required for AccountAbstractionProvider.getProviderInstance() which calls these methods
 * to derive the Safe Smart Account address.
 */
async function buildProviderFromPrivKey(privKey: string): Promise<IProvider> {
  const pkProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: "0x2105",
        rpcTarget: "https://base-rpc.publicnode.com",
        displayName: "Base Mainnet",
        blockExplorerUrl: "https://basescan.org",
        ticker: "ETH",
        tickerName: "Ethereum",
      },
    },
  });
  await pkProvider.setupProvider(privKey);
  return pkProvider;
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

export function setAAProvider(provider: any): void {
  storedAAProvider = provider;
}

export function getAAProvider(): any {
  return storedAAProvider;
}

export function clearAAProvider(): void {
  storedAAProvider = null;
  pendingAASetupPromise = null;
  storedChainAAProviders.clear();
}

export function getAAProviderForChain(chainId: number): any {
  return storedChainAAProviders.get(chainId) || null;
}

function derivePimlicoUrlForChain(baseUrl: string, targetChainId: number): string {
  // Pimlico format: https://api.pimlico.io/v2/8453/rpc?apikey=xxx → replace chain ID
  return baseUrl.replace(/\/\d+\/rpc/, `/${targetChainId}/rpc`);
}

/**
 * Set up an AA provider for a specific chain (e.g. BNB = 56).
 * Derives Pimlico URLs from the cached Base config by replacing the chain ID segment.
 * Caches the result per chain so subsequent calls are instant.
 */
export async function setupAAProviderForChain(targetChainId: number): Promise<any> {
  const cached = storedChainAAProviders.get(targetChainId);
  if (cached) return cached;

  const chainInfo = AA_CHAIN_CONFIGS[targetChainId];
  if (!chainInfo) {
    console.warn('[Web3Auth] No AA chain config for chainId:', targetChainId);
    return null;
  }

  const privKey = web3authInstance ? extractPrivKeyFromConnector(web3authInstance) : null;
  if (!privKey) {
    console.warn('[Web3Auth] No private key available for chain-specific AA setup (chainId:', targetChainId, ')');
    return null;
  }

  const pimlicoConfig = await getPimlicoConfig();
  if (!pimlicoConfig?.bundlerUrl) {
    console.warn('[Web3Auth] Pimlico config unavailable for chain-specific AA');
    return null;
  }

  const bundlerUrl = derivePimlicoUrlForChain(pimlicoConfig.bundlerUrl, targetChainId);
  const paymasterUrl = derivePimlicoUrlForChain(pimlicoConfig.paymasterUrl, targetChainId);

  const pkProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: chainInfo.chainIdHex,
        rpcTarget: chainInfo.rpcTarget,
        displayName: chainInfo.displayName,
      },
    },
  });
  await pkProvider.setupProvider(privKey);

  const aaProvider = await AccountAbstractionProvider.getProviderInstance({
    eoaProvider: pkProvider,
    smartAccountInit: new SafeSmartAccount(),
    chainConfig: {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: chainInfo.chainIdHex,
      rpcTarget: chainInfo.rpcTarget,
      displayName: chainInfo.displayName,
      blockExplorerUrl: chainInfo.blockExplorerUrl,
      ticker: chainInfo.ticker,
      tickerName: chainInfo.tickerName,
    },
    bundlerConfig: { url: bundlerUrl },
    paymasterConfig: { url: paymasterUrl },
  });

  storedChainAAProviders.set(targetChainId, aaProvider);
  console.log('[Web3Auth] Chain-specific AA provider ready for', chainInfo.displayName, `(${targetChainId})`);
  return aaProvider;
}

export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) {
    await web3authInstance.logout();
  }
  // Always clear storage on disconnect — our WsEmbed recovery path leaves
  // web3authInstance.connected === false even after a successful social login,
  // so the connected check above would skip cleanup and leave the openlogin
  // session cached, causing the next login to silently reuse the old session.
  clearWeb3AuthStorage();
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
  clearWeb3AuthStorage();

  // Delayed re-init to avoid rate limiting (don't hammer api.web3auth.io)
  setTimeout(() => initWeb3Auth().catch(() => { }), 5000);
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}

/**
 * Refresh the Web3Auth provider in-memory WITHOUT clearing storage.
 * Used to recover from "Torus Keyring - Unable to find matching address" errors
 * that occur when the key shard hasn't been reconstructed after session restore.
 * If the openlogin_* session is still valid, re-init will fully load the key.
 * Returns the fresh provider, or null if the session truly expired.
 */
export async function refreshWeb3AuthProvider(): Promise<any> {
  console.log('[Web3Auth] Refreshing provider (keeping storage for session restore)...');
  // Reset in-memory state only — do NOT touch storage so init() can re-read openlogin_* keys
  web3authInstance = null;
  isInitializing = false;
  initPromise = null;

  try {
    const freshInstance = await initWeb3Auth();
    if (freshInstance.connected && freshInstance.provider) {
      console.log('[Web3Auth] Provider refreshed — session restored successfully');
      return freshInstance.provider;
    }
    console.warn('[Web3Auth] Provider refresh: init completed but not connected');
    return null;
  } catch (e) {
    console.warn('[Web3Auth] Provider refresh failed:', e);
    return null;
  }
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

/**
 * Open Web3Auth's built-in fiat on-ramp checkout (Stripe, Revolut, MoonPay, etc.)
 * Requires an active Web3Auth session (social login). Throws if not connected.
 */
export async function showWeb3AuthCheckout(): Promise<void> {
  // Wallet Services plugin is disabled (Web3Auth /auth/verify server-side regression).
  // Re-enable once Web3Auth fixes their 500-char signature validation limit.
  throw new Error("Fiat on-ramp is temporarily unavailable. Please try again later.");
}

/**
 * Create an AccountAbstractionProvider from an EOA provider (post-login).
 * This is called AFTER Web3Auth social login completes — NOT during init.
 * Avoids the Web3Auth modal's internal Torus controller which calls
 * api-wallet.web3auth.io/auth/verify and fails with 400 when accountAbstractionConfig
 * is set on the modal directly.
 *
 * IMPORTANT: AccountAbstractionProvider calls personal_sign on eoaProvider internally
 * when building the Safe signature. If eoaProvider is the Web3Auth modal provider,
 * that personal_sign routes through WsEmbed → api-wallet.web3auth.io/auth/verify,
 * which rejects ERC-6492 signatures (> 500 chars) with "Invalid signature" (-32603).
 *
 * Fix: Extract the raw private key from the provider (via private_key RPC method)
 * and build an EthereumPrivateKeyProvider for pure in-process signing — no WsEmbed,
 * no network calls. The Smart Account address is identical (same key → same Safe).
 *
 * Returns null if Pimlico config is unavailable (AA is best-effort).
 */
export async function setupAAProvider(eoaProvider: IProvider): Promise<AccountAbstractionProvider | null> {
  // Return immediately if already set up
  if (storedAAProvider) return storedAAProvider;
  // Deduplicate concurrent calls — share one in-flight promise
  if (pendingAASetupPromise) {
    console.log('[Web3Auth] AA setup already in progress — awaiting shared promise');
    return pendingAASetupPromise;
  }

  pendingAASetupPromise = _doSetupAAProvider(eoaProvider).finally(() => {
    pendingAASetupPromise = null;
  });
  return pendingAASetupPromise;
}

async function _doSetupAAProvider(eoaProvider: IProvider): Promise<AccountAbstractionProvider | null> {
  try {
    const pimlicoConfig = await getPimlicoConfig();
    if (!pimlicoConfig?.bundlerUrl || !pimlicoConfig?.paymasterUrl) {
      console.warn('[Web3Auth] Pimlico config unavailable — skipping AA setup');
      return null;
    }

    // Resolve the signing provider — bypass WsEmbed by using EthereumPrivateKeyProvider.
    // WsEmbed intercepts personal_sign and routes it through api-wallet.web3auth.io/auth/verify,
    // which rejects ERC-6492 signatures (> 500 chars) with "Invalid signature" since Apr 10 2026.
    let signingProvider: IProvider = eoaProvider;

    if (!(eoaProvider instanceof EthereumPrivateKeyProvider)) {
      // Try to extract private key directly from the modal provider (standard Web3Auth RPC method).
      // Works in the happy path (WsEmbed login succeeded) and gives the same key as DKG produced.
      try {
        const privKey = await eoaProvider.request({ method: 'private_key' }) as string;
        if (privKey && privKey.length >= 32) {
          signingProvider = await buildProviderFromPrivKey(privKey);
          console.log('[Web3Auth] AA setup: using EthereumPrivateKeyProvider (bypassed WsEmbed)');
        }
      } catch {
        // private_key not accessible on this provider — try connector fallback
        const privKey = extractPrivKeyFromConnector(web3authInstance!);
        if (privKey) {
          signingProvider = await buildProviderFromPrivKey(privKey);
          console.log('[Web3Auth] AA setup: using EthereumPrivateKeyProvider via connector fallback');
        } else {
          console.warn('[Web3Auth] AA setup: could not extract private key — WsEmbed may intercept signing');
        }
      }
    } else {
      console.log('[Web3Auth] AA setup: eoaProvider is already EthereumPrivateKeyProvider — using as-is');
    }

    const aaProvider = await AccountAbstractionProvider.getProviderInstance({
      eoaProvider: signingProvider,
      smartAccountInit: new SafeSmartAccount(),
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: "0x2105",
        rpcTarget: "https://base-rpc.publicnode.com",
        displayName: "Base Mainnet",
        blockExplorerUrl: "https://basescan.org",
        ticker: "ETH",
        tickerName: "Ethereum",
      },
      bundlerConfig: { url: pimlicoConfig.bundlerUrl },
      paymasterConfig: { url: pimlicoConfig.paymasterUrl },
    });

    console.log('[Web3Auth] AA provider set up successfully (post-login)');
    return aaProvider;
  } catch (e) {
    console.warn('[Web3Auth] AA provider setup failed:', e);
    return null;
  }
}
