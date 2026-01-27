/**
 * Web3Auth Configuration - Simplified Setup
 * ==========================================
 * Basic Web3Auth Modal SDK setup for Base Mainnet.
 */

import { Web3Auth, CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/modal";
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

/**
 * Some privacy browsers/adblockers block Segment (api.segment.io).
 * Web3Auth uses Segment for telemetry; in certain environments the SDK can appear to hang
 * on "verifying" while those requests are repeatedly retried.
 *
 * This patch no-ops ONLY Segment calls and leaves all other fetch calls untouched.
 */
function patchSegmentFetchOnce() {
  const g = globalThis as unknown as {
    fetch?: typeof fetch;
    __dehub_segment_fetch_patched?: boolean;
  };

  if (g.__dehub_segment_fetch_patched) return;
  if (typeof g.fetch !== "function") return;

  const originalFetch = g.fetch.bind(globalThis);

  g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.includes("api.segment.io")) {
        // Return a successful no-op response.
        return new Response("", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
    } catch {
      // If URL parsing fails for any reason, fall through.
    }

    return originalFetch(input as any, init);
  }) as typeof fetch;

  g.__dehub_segment_fetch_patched = true;
  console.log("[Web3Auth] Patched fetch to no-op api.segment.io telemetry calls");
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
 * Initialize Web3Auth - call this early in app lifecycle
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
      // Apply environment hardening before SDK bootstraps its internal telemetry.
      patchSegmentFetchOnce();

      // Fetch client ID
      console.log("[Web3Auth] Fetching configuration...");
      const clientId = await getWeb3AuthClientId();
      console.log("[Web3Auth] ✓ Client ID fetched:", clientId?.substring(0, 15) + "...");

      // Create Web3Auth instance with minimal config
      console.log("[Web3Auth] Creating Web3Auth instance...");
      web3authInstance = new Web3Auth({
        clientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
        // Redirect UX mode is more reliable than popups/iframes in some privacy browsers.
        uiConfig: {
          uxMode: "redirect",
        },
      });
      console.log("[Web3Auth] ✓ Instance created");

      // Initialize
      console.log("[Web3Auth] Calling init()...");
      await web3authInstance.init();
      console.log("[Web3Auth] ✓ init() completed, status:", web3authInstance.status);

      // Wait for ready state if needed
      if (web3authInstance.status !== "ready" && web3authInstance.status !== "connected") {
        console.log("[Web3Auth] Waiting for ready state...");
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Web3Auth init timeout"));
          }, 10000);

          const checkReady = () => {
            const status = web3authInstance?.status;
            if (status === "ready" || status === "connected") {
              clearTimeout(timeout);
              resolve();
            } else if (status === "errored") {
              clearTimeout(timeout);
              reject(new Error("Web3Auth errored"));
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      }

      console.log("[Web3Auth] ✓ INITIALIZATION COMPLETE, status:", web3authInstance.status);
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
