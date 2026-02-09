/**
 * Web3Auth Configuration with No-Modal SDK v8
 * ============================================
 * Web3Auth No-Modal SDK v8 for Base Mainnet with direct private key access.
 * Uses EthereumPrivateKeyProvider + OpenloginAdapter for eth_private_key support
 * to generate standard ECDSA signatures required by DeHub backend.
 *
 * CUSTOM UI MODE: Uses connectTo() for direct provider connections
 * without showing any Web3Auth modal.
 */

import { Web3AuthNoModal } from "@web3auth/no-modal";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import {
  CHAIN_NAMESPACES,
  WEB3AUTH_NETWORK,
  WALLET_ADAPTERS,
  UX_MODE,
  IProvider,
} from "@web3auth/base";
import { MetamaskAdapter } from "@web3auth/metamask-adapter";
import { WalletConnectV2Adapter } from "@web3auth/wallet-connect-v2-adapter";
import { CoinbaseAdapter } from "@web3auth/coinbase-adapter";
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
export { WALLET_ADAPTERS };

// Auth connection types for social login (maps to Web3Auth login providers)
export const AUTH_CONNECTION = {
  GOOGLE: "google",
  APPLE: "apple",
  TWITTER: "twitter",
  DISCORD: "discord",
  TELEGRAM: "telegram",
  GITHUB: "github",
  EMAIL_PASSWORDLESS: "email_passwordless",
  SMS_PASSWORDLESS: "sms_passwordless",
} as const;

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

let web3authInstance: Web3AuthNoModal | null = null;
let isInitializing = false;
let initPromise: Promise<Web3AuthNoModal> | null = null;
let cachedClientId: string | null = null;
// Track which adapter was last used (for detecting social login vs external wallet)
let lastConnectedAdapter: string | null = null;

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
  lastConnectedAdapter = null;
  console.log("[Web3Auth] Module state reset");
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

/**
 * Initialize Web3Auth No-Modal v8 with direct private key access
 * Uses EthereumPrivateKeyProvider + OpenloginAdapter for eth_private_key support
 */
export async function initWeb3Auth(): Promise<Web3AuthNoModal> {
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
      // Fetch Web3Auth client ID
      console.log("[Web3Auth] Fetching configuration...");
      const clientId = await getWeb3AuthClientId();
      console.log("[Web3Auth] Client ID fetched:", clientId?.substring(0, 15) + "...");

      // Create private key provider for direct key access
      console.log("[Web3Auth] Creating EthereumPrivateKeyProvider...");
      const privateKeyProvider = new EthereumPrivateKeyProvider({
        config: { chainConfig },
      });
      console.log("[Web3Auth] PrivateKeyProvider created");

      // Create Web3Auth No-Modal instance
      console.log("[Web3Auth] Creating Web3AuthNoModal instance...");
      console.log("[Web3Auth] Is mobile device:", isMobileDevice());
      console.log("[Web3Auth] UX Mode:", isMobileDevice() ? "REDIRECT" : "POPUP");

      web3authInstance = new Web3AuthNoModal({
        clientId,
        chainConfig,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      });
      console.log("[Web3Auth] Web3AuthNoModal instance created");

      // Configure Openlogin adapter for social/email/sms logins
      console.log("[Web3Auth] Configuring Openlogin adapter...");
      const openloginAdapter = new OpenloginAdapter({
        privateKeyProvider,
        adapterSettings: {
          uxMode: isMobileDevice() ? UX_MODE.REDIRECT : UX_MODE.POPUP,
          redirectUrl: window.location.origin,
        },
      });
      web3authInstance.configureAdapter(openloginAdapter);
      console.log("[Web3Auth] Openlogin adapter configured");

      // Configure MetaMask Adapter
      console.log("[Web3Auth] Configuring MetaMask adapter...");
      const metamaskAdapter = new MetamaskAdapter({
        clientId,
        sessionTime: 3600,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        chainConfig,
      });
      web3authInstance.configureAdapter(metamaskAdapter);

      // Configure WalletConnect V2 Adapter
      console.log("[Web3Auth] Configuring WalletConnect V2 adapter...");
      const walletConnectV2Adapter = new WalletConnectV2Adapter({
        adapterSettings: {
          walletConnectInitOptions: {
            projectId: "0751965bb69056635999763785664539",
          },
        } as any,
        chainConfig,
      });
      web3authInstance.configureAdapter(walletConnectV2Adapter);

      // Configure Coinbase Adapter
      console.log("[Web3Auth] Configuring Coinbase adapter...");
      const coinbaseAdapter = new CoinbaseAdapter({
        clientId,
        sessionTime: 3600,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        chainConfig,
      });
      web3authInstance.configureAdapter(coinbaseAdapter);

      console.log("[Web3Auth] External wallet adapters configured");

      // Initialize
      console.log("[Web3Auth] Calling init()...");

      const initWithTimeout = Promise.race([
        web3authInstance.init(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Web3Auth init timeout")), 15000)
        )
      ]);

      await initWithTimeout;
      console.log("[Web3Auth] init() completed, status:", web3authInstance.status);
      console.log("[Web3Auth] Connected:", web3authInstance.connected);

      console.log("[Web3Auth] INITIALIZATION COMPLETE (No-Modal v8 + PrivateKeyProvider), status:", web3authInstance.status);
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
 * Connect to a specific social login provider using connectTo()
 * This bypasses any modal completely - direct provider connection
 */
export async function connectToSocialProvider(
  authConnection: AuthConnectionType,
  loginHint?: string
): Promise<IProvider | null> {
  console.log(`[Web3Auth] connectToSocialProvider: phase=INIT authConnection=${authConnection} loginHint=${loginHint ? 'set' : 'none'}`);

  let web3auth: Web3AuthNoModal;
  try {
    web3auth = await getOrInitWeb3Auth();
    console.log(`[Web3Auth] connectToSocialProvider: phase=READY status=${web3auth.status}`);
  } catch (err) {
    console.error(`[Web3Auth] connectToSocialProvider: phase=INIT_FAILED`, err);
    throw err;
  }

  const extraLoginOptions: Record<string, unknown> = {};

  // Add login hint for email/sms passwordless
  if (loginHint) {
    extraLoginOptions.login_hint = loginHint;
  }

  let provider: IProvider | null;
  try {
    console.log(`[Web3Auth] connectToSocialProvider: phase=CONNECT calling connectTo(${WALLET_ADAPTERS.OPENLOGIN}, { loginProvider: ${authConnection} })`);
    provider = await web3auth.connectTo(WALLET_ADAPTERS.OPENLOGIN, {
      loginProvider: authConnection,
      extraLoginOptions,
    });
    lastConnectedAdapter = WALLET_ADAPTERS.OPENLOGIN; // Track that this was a social login
    console.log(`[Web3Auth] connectToSocialProvider: phase=CONNECT_OK provider=${provider ? 'received' : 'null'}`);
  } catch (err) {
    console.error(`[Web3Auth] connectToSocialProvider: phase=CONNECT_FAILED`, err);
    throw err;
  }

  console.log(`[Web3Auth] connectToSocialProvider: phase=DONE status=${web3auth.status} connected=${web3auth.connected}`);
  console.log(`[Web3Auth] Connected to ${authConnection}`);
  return provider;
}

/**
 * Connect to an external wallet (MetaMask, WalletConnect, etc.)
 * Note: External wallet adapters need to be configured separately
 */
export async function connectToExternalWallet(
  walletAdapter: string
): Promise<IProvider | null> {
  const web3auth = await getOrInitWeb3Auth();

  console.log(`[Web3Auth] Connecting to external wallet: ${walletAdapter}...`);

  const provider = await web3auth.connectTo(walletAdapter);
  lastConnectedAdapter = walletAdapter; // Track that this was an external wallet

  console.log(`[Web3Auth] Connected to ${walletAdapter}`);
  return provider;
}

/**
 * Get the initialized Web3Auth instance
 */
export function getWeb3Auth(): Web3AuthNoModal {
  if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
    throw new Error("Web3Auth not initialized. Call initWeb3Auth() first.");
  }
  return web3authInstance;
}

/**
 * Get or initialize Web3Auth
 */
export async function getOrInitWeb3Auth(): Promise<Web3AuthNoModal> {
  if (web3authInstance?.status === "ready" || web3authInstance?.status === "connected") {
    return web3authInstance;
  }
  return initWeb3Auth();
}

export function getWeb3AuthInstance(): Web3AuthNoModal | null {
  return web3authInstance;
}

export function getWeb3AuthProvider(): IProvider | null {
  return web3authInstance?.provider || null;
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
 * Check if the current connection is via social login (Openlogin adapter)
 * Used to determine signing method (private key vs provider)
 */
export function isSocialLoginConnected(): boolean {
  return lastConnectedAdapter === WALLET_ADAPTERS.OPENLOGIN;
}

/**
 * Get the last connected adapter name
 */
export function getLastConnectedConnector(): string | null {
  return lastConnectedAdapter;
}

/**
 * Set the last connected adapter (used when restoring session from redirect)
 */
export function setLastConnectedConnector(connector: string | null): void {
  lastConnectedAdapter = connector;
}
