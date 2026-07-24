/**
 * LEGACY Web3Auth — one-time wallet migration only
 * ================================================
 * Lets an existing social/email user log in through the old Web3Auth flow
 * ONCE, reconstructs their private key in the browser (Sapphire DKG — the key
 * never touches our servers), and hands it to the new self-custody wallet
 * system for import. Same key → same Safe smart account → same DeHub account.
 *
 * IMPORTANT:
 * - Everything here is dynamically imported. This module (and @web3auth/modal,
 *   ~1 MB) must only ever load when the user explicitly starts a migration —
 *   never on the normal login path.
 * - Delete this module (and the @web3auth/modal dependency) once the
 *   migration window closes.
 */

import { supabase } from "@/integrations/supabase/client";
import { isMobileDevice } from "@/lib/web3auth";

export type LegacyProvider = "google" | "twitter" | "discord" | "apple" | "email_passwordless";

// sessionStorage flag: a migration login is in flight (needed to resume after
// the mobile redirect round-trip).
const MIGRATION_PENDING_KEY = "dehub_legacy_migration_pending";

const WEB3AUTH_NETWORK_SAPPHIRE = "sapphire_mainnet";
const AUTH_CONNECTOR = "auth";

const chainConfig = {
  chainNamespace: "eip155",
  chainId: "0x2105",
  rpcTarget: "https://base-rpc.publicnode.com",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
};

let cachedClientId: string | null = null;

async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const stored = sessionStorage.getItem("dehub_web3auth_client_id");
  if (stored) {
    cachedClientId = stored;
    return stored;
  }
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  if (error || !data?.clientId) {
    throw new Error(error?.message || "Web3Auth client ID not configured");
  }
  cachedClientId = data.clientId;
  sessionStorage.setItem("dehub_web3auth_client_id", data.clientId);
  return cachedClientId!;
}

/**
 * Clear Web3Auth/Torus persisted session from storage. 'auth_store' MUST be
 * included — it holds the Sapphire sessionId; leaving it causes the next
 * init() to silently restore the previous user's session (session bleeding).
 */
function clearLegacyStorage(): void {
  if (typeof window === "undefined") return;
  const prefixes = ["torus", "web3auth", "tkey", "openlogin", "auth_store"];
  const excludePrefixes = ["dehub_"];
  for (const storage of [localStorage, sessionStorage]) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const lk = key.toLowerCase();
      if (excludePrefixes.some(p => lk.startsWith(p))) continue;
      if (prefixes.some(p => lk.includes(p))) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => storage.removeItem(k));
  }
}

/** Web3Auth v10 attaches redirect params in hash OR search. */
export function hasLegacyRedirectResult(): boolean {
  if (typeof window === "undefined") return false;
  const combined = window.location.hash + window.location.search;
  return (
    combined.includes("b64Params") ||
    combined.includes("sessionId") ||
    combined.includes("sessionNamespace")
  );
}

export function isLegacyMigrationPending(): boolean {
  try { return !!sessionStorage.getItem(MIGRATION_PENDING_KEY); } catch { return false; }
}

function clearMigrationPending(): void {
  try { sessionStorage.removeItem(MIGRATION_PENDING_KEY); } catch { /* ignore */ }
}

async function initLegacyWeb3Auth(): Promise<any> {
  const clientId = await getClientId();
  const { Web3Auth } = await import("@web3auth/modal");
  const instance = new Web3Auth({
    clientId,
    chains: [chainConfig],
    web3AuthNetwork: WEB3AUTH_NETWORK_SAPPHIRE,
    sessionTime: 3600, // short — we only need one extraction
    uiConfig: { modalZIndex: "99999" },
    walletServicesConfig: {
      whiteLabel: { showWidgetButton: false },
      confirmationStrategy: "auto_approve",
    },
  } as any);

  await Promise.race([
    instance.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Web3Auth init timed out after 30s")), 30000)
    ),
  ]);

  // v10: init() resolves before the connectors finish initializing — calling
  // connectTo() while status is "not_ready" throws "connector is not ready yet".
  // Same wait the old production module used.
  if (instance.status === "not_ready") {
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (instance.status !== "not_ready") break;
    }
  }
  if (instance.status === "not_ready") {
    throw new Error("Web3Auth is taking too long to start. Please try again.");
  }
  return instance;
}

/**
 * Pull the reconstructed private key out of a connected instance.
 * Happy path: the provider's non-standard `private_key` RPC. Fallback: the
 * auth connector's authInstance — populated after DKG even when the final
 * WsEmbed step of connectTo() throws (their known /auth/verify 400 bug).
 */
async function extractKey(web3auth: any, provider: any | null): Promise<string | null> {
  if (provider) {
    try {
      const pk = await provider.request({ method: "private_key" }) as string;
      if (pk && pk.length >= 32) return pk;
    } catch { /* fall through */ }
  }
  try {
    const connector = web3auth.connectedConnector
      || web3auth.connectors?.find((c: any) => c.name === AUTH_CONNECTOR);
    const authInstance = connector?.authInstance;
    const pk = authInstance?.privKey || authInstance?.coreKitKey;
    if (pk && pk.length >= 32) return pk;
  } catch { /* ignore */ }
  return null;
}

/** Invalidate the Sapphire session + wipe storage so nothing lingers. */
async function cleanupLegacySession(web3auth: any | null): Promise<void> {
  try {
    const connector = web3auth?.connectors?.find((c: any) => c.name === AUTH_CONNECTOR);
    if (connector?.authInstance) {
      try { await connector.authInstance.logout(); } catch { /* already logged out */ }
      try {
        const BrowserStorageClass = connector.authInstance.currentStorage?.constructor;
        if (BrowserStorageClass?.instanceMap instanceof Map) {
          BrowserStorageClass.instanceMap.clear();
        }
      } catch { /* ignore */ }
    }
    if (web3auth?.connected) {
      try { await web3auth.logout(); } catch { /* ignore */ }
    }
  } finally {
    clearLegacyStorage();
    clearMigrationPending();
  }
}

function isPopupBlockedError(err: unknown): boolean {
  const combined = String(err).toLowerCase() +
    (err instanceof Error ? " " + String((err as any).cause).toLowerCase() : "");
  return (
    (combined.includes("popup") && (combined.includes("blocked") || combined.includes("closed"))) ||
    combined.includes("allow-popups") ||
    combined.includes("coop")
  );
}

function forceLoginOptions(provider: LegacyProvider): Record<string, string> {
  switch (provider) {
    case "google": return { prompt: "select_account" };
    case "twitter": return { force_login: "true" };
    case "discord":
    case "apple": return { prompt: "login" };
    default: return {};
  }
}

function buildConnectParams(provider: LegacyProvider, loginHint: string | undefined, useRedirect: boolean) {
  return {
    authConnection: provider,
    uxMode: useRedirect ? "redirect" : "popup",
    ...(useRedirect ? { redirectUrl: window.location.origin + window.location.pathname } : {}),
    extraLoginOptions: {
      ...forceLoginOptions(provider),
      ...(loginHint ? { login_hint: loginHint } : {}),
    },
  };
}

/**
 * Run the one-time legacy login and return the raw private key (hex).
 *
 * Desktop: popup flow — resolves with the key in the same page session.
 * Mobile (or popup blocked): falls back to a full-page redirect; this promise
 * never resolves — the page navigates away and the caller must resume via
 * resumeLegacyMigration() after returning.
 */
export async function startLegacyMigration(
  provider: LegacyProvider,
  loginHint?: string,
): Promise<string> {
  try { sessionStorage.setItem(MIGRATION_PENDING_KEY, "1"); } catch { /* ignore */ }

  // Fresh start — never reuse a stale session from a previous user.
  clearLegacyStorage();
  const web3auth = await initLegacyWeb3Auth();

  const useRedirect = isMobileDevice();
  const params = buildConnectParams(provider, loginHint, useRedirect);

  let connectedProvider: any = null;
  let connectError: unknown = null;
  try {
    connectedProvider = await web3auth.connectTo(AUTH_CONNECTOR, params);
  } catch (err) {
    connectError = err;
    if (isPopupBlockedError(err) && !useRedirect) {
      // Redirect fallback — navigates away; resume handles the return leg.
      const redirectParams = buildConnectParams(provider, loginHint, true);
      await web3auth.connectTo(AUTH_CONNECTOR, redirectParams);
      // Unreachable in practice (page navigates), but keep TS happy:
      throw new Error("Redirecting to complete login…");
    }
  }

  // Key is often extractable even when connectTo threw (WsEmbed 400 bug).
  const key = await extractKey(web3auth, connectedProvider);
  await cleanupLegacySession(web3auth);

  if (!key) {
    throw connectError instanceof Error
      ? connectError
      : new Error("Could not retrieve your old wallet key. Please try again.");
  }
  return key.startsWith("0x") ? key : `0x${key}`;
}

/**
 * Resume the mobile/redirect leg: called on page load when a migration was
 * pending and the URL carries Web3Auth redirect params. Returns the key, or
 * null if there is nothing to resume.
 */
export async function resumeLegacyMigration(): Promise<string | null> {
  if (!isLegacyMigrationPending() || !hasLegacyRedirectResult()) return null;

  let web3auth: any = null;
  try {
    // init() consumes the redirect params from the URL and restores the session.
    web3auth = await initLegacyWeb3Auth();
    const provider = web3auth.connected ? web3auth.provider : null;
    const key = await extractKey(web3auth, provider);
    if (!key) throw new Error("Could not retrieve your old wallet key. Please try again.");
    return key.startsWith("0x") ? key : `0x${key}`;
  } finally {
    await cleanupLegacySession(web3auth);
    // Strip the Web3Auth params so a refresh doesn't reprocess them.
    try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
  }
}
