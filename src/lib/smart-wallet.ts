/**
 * DeHub Smart Wallet session
 * ==========================
 * Replaces Web3Auth's key infrastructure with the self-custody wallet system
 * (BIP-39 seed encrypted client-side, stored in Supabase — see lib/wallet-core).
 *
 * Identity comes from Supabase Auth (email OTP / social OAuth). After the user
 * unlocks their wallet with the wallet password, the derived ETH key powers:
 *   - EthereumPrivateKeyProvider  → EOA signing (pure in-process, no network)
 *   - AccountAbstractionProvider  → Safe Smart Account via Pimlico (sponsored gas)
 *
 * The Smart Account address is identical to the old flow for the same key
 * (same EOA → same Safe), and the DeHub backend auth contract is unchanged.
 *
 * Decrypted key material is never written to sessionStorage/localStorage. Any
 * script running on this origin (a compromised npm dependency, an XSS payload)
 * can read Web Storage directly, so a plaintext key there is a single point of
 * failure.
 *
 * It IS persisted across page loads, as AES-GCM ciphertext under an
 * unexportable CryptoKey held in IndexedDB (see wallet-core/key-vault.ts).
 * Before that, the key was memory-only and every refresh — including the
 * in-app hard navigation new accounts hit right after signup — silently
 * relocked the wallet, so "unlock once" in the Settings copy was never true
 * and people were retyping a 12-character password to send a post. The unlock
 * now lasts until logout, bounded by the user's auto-lock interval.
 */

import type { IProvider } from "@web3auth/base";
import type { AccountAbstractionProvider } from "@web3auth/account-abstraction-provider";
import { supabase } from "@/integrations/supabase/client";
import { getWalletUnlockIntervalMs } from "@/hooks/use-wallet-unlock-interval";
import { saveVaultSession, readVaultSession, clearVaultSession } from "@/lib/wallet-core/key-vault";

const CHAIN_NAMESPACES = { EIP155: "eip155" } as const;

// ── Dynamic imports (heavy SDKs, cached once) ───────────────────────────────
let _ethProviderMod: typeof import("@web3auth/ethereum-provider") | null = null;
async function loadEthProvider() {
  if (!_ethProviderMod) _ethProviderMod = await import("@web3auth/ethereum-provider");
  return _ethProviderMod;
}
let _aaMod: typeof import("@web3auth/account-abstraction-provider") | null = null;
async function loadAAProvider() {
  if (!_aaMod) _aaMod = await import("@web3auth/account-abstraction-provider");
  return _aaMod;
}

// ── Chain configs ───────────────────────────────────────────────────────────
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
  1: {
    chainIdHex: "0x1",
    rpcTarget: "https://ethereum-rpc.publicnode.com",
    displayName: "Ethereum Mainnet",
    blockExplorerUrl: "https://etherscan.io",
    ticker: "ETH",
    tickerName: "Ethereum",
  },
};

const BASE_CHAIN = AA_CHAIN_CONFIGS[8453];

// ── Module state ────────────────────────────────────────────────────────────
// The decrypted key itself is intentionally NOT in Web Storage. It lives in the
// sessionPrivKey variable below, plus — so it survives a reload — as ciphertext
// in the IndexedDB vault. Only the timestamp below is stored in the clear.
//
// localStorage rather than sessionStorage: sessionStorage is per-tab and dies
// with the tab, which would put the sync lock state out of step with a vault
// that outlives it, and would report "locked" in a second tab that is not.
const UNLOCKED_AT_KEY = "dehub_wallet_unlocked_at"; // ms timestamp of last unlock, no secret

let sessionPrivKey: string | null = null; // hex, no 0x prefix
let eoaProvider: IProvider | null = null;
let hydrationPromise: Promise<IProvider | null> | null = null; // vault → provider, in flight
let storedAAProvider: AccountAbstractionProvider | null = null;
let pendingAASetupPromise: Promise<AccountAbstractionProvider | null> | null = null;
const storedChainAAProviders = new Map<number, AccountAbstractionProvider>();

// ── Pimlico config (unchanged from the old web3auth module) ─────────────────
let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;
let pendingPimlicoFetch: Promise<{ bundlerUrl: string; paymasterUrl: string }> | null = null;

async function fetchWithRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[SmartWallet] ${label} attempt ${i + 1} failed:`, err);
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 500));
    }
  }
  throw lastError;
}

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;

  const stored = sessionStorage.getItem("dehub_pimlico_config");
  if (stored) {
    try {
      cachedPimlicoConfig = JSON.parse(stored);
      return cachedPimlicoConfig!;
    } catch { /* fall through */ }
  }

  if (pendingPimlicoFetch) return pendingPimlicoFetch;

  pendingPimlicoFetch = fetchWithRetry(async () => {
    const { data, error } = await supabase.functions.invoke("get-pimlico-config");
    if (!error && data?.bundlerUrl && data?.paymasterUrl) {
      cachedPimlicoConfig = data;
      sessionStorage.setItem("dehub_pimlico_config", JSON.stringify(data));
      return cachedPimlicoConfig!;
    }
    throw new Error(error?.message || "Pimlico config not configured");
  }, "get-pimlico-config").finally(() => { pendingPimlicoFetch = null; });

  return pendingPimlicoFetch;
}

function derivePimlicoUrlForChain(baseUrl: string, targetChainId: number): string {
  // Pimlico format: https://api.pimlico.io/v2/8453/rpc?apikey=xxx → replace chain ID
  return baseUrl.replace(/\/\d+\/rpc/, `/${targetChainId}/rpc`);
}

// ── Key session ─────────────────────────────────────────────────────────────

function normalizePrivKey(privKey: string): string {
  const hex = privKey.startsWith("0x") ? privKey.slice(2) : privKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Invalid private key");
  return hex.toLowerCase();
}

async function buildProviderFromPrivKey(privKeyNo0x: string): Promise<IProvider> {
  const { EthereumPrivateKeyProvider } = await loadEthProvider();
  const pkProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: BASE_CHAIN.chainIdHex,
        rpcTarget: BASE_CHAIN.rpcTarget,
        displayName: BASE_CHAIN.displayName,
        blockExplorerUrl: BASE_CHAIN.blockExplorerUrl,
        ticker: BASE_CHAIN.ticker,
        tickerName: BASE_CHAIN.tickerName,
      },
    },
  });
  await pkProvider.setupProvider(privKeyNo0x);
  return pkProvider as unknown as IProvider;
}

function readUnlockedAt(): number | null {
  try {
    const raw = localStorage.getItem(UNLOCKED_AT_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** True once the unlock is older than the user's configured auto-lock interval. */
function unlockExpired(unlockedAt: number | null): boolean {
  const intervalMs = getWalletUnlockIntervalMs();
  if (intervalMs === null) return false; // "Never" — no auto-lock timer
  if (unlockedAt === null) return true;
  return Date.now() - unlockedAt > intervalMs;
}

/**
 * Activate a wallet session from a decrypted private key (post-unlock/create).
 * Builds the EOA provider, then hands the key to the IndexedDB vault so the
 * next page load can pick it up without asking for the password again.
 *
 * The vault write is deliberately not awaited: it is an optimisation on the
 * NEXT load, and making the caller wait on IDB would put a disk round-trip in
 * front of the "Signing you in…" button for no benefit this load.
 */
export async function activateWalletKey(privKey: string): Promise<IProvider> {
  const hex = normalizePrivKey(privKey);
  sessionPrivKey = hex;
  const unlockedAt = Date.now();
  // Only a timestamp, never the key itself — Web Storage is world-readable to
  // any script on the origin, so the raw key must never land there. The key
  // goes to the vault below, encrypted under an unexportable handle.
  try { localStorage.setItem(UNLOCKED_AT_KEY, String(unlockedAt)); } catch { /* private mode */ }
  eoaProvider = await buildProviderFromPrivKey(hex);
  hydrationPromise = null;

  const address = await addressFromProvider(eoaProvider);
  if (address) void saveVaultSession(hex, address, unlockedAt);

  announceLockChange();
  return eoaProvider;
}

/** The EOA address a provider will sign with, or null if it won't say. */
async function addressFromProvider(provider: IProvider): Promise<string | null> {
  try {
    const accounts = await provider.request({ method: "eth_accounts" }) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Lock state lives in module memory, so nothing re-renders when it changes.
 * Anything that wants to show a lock affordance — the wallet menu's "Unlock
 * wallet" row, a composer button reading "Unlock to post" — has to hear about
 * the transition rather than poll isWalletUnlocked() at render time.
 */
export const WALLET_LOCK_CHANGED_EVENT = 'dehub:wallet-lock-changed';

function announceLockChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WALLET_LOCK_CHANGED_EVENT));
}

/**
 * True when a decrypted key is available in THIS page's memory AND the user's
 * configured auto-lock interval (Settings → Account Security) hasn't elapsed.
 * Logging into DeHub never needs this — only signing a wallet action does.
 *
 * Note this is the strict, synchronous reading: immediately after a reload it
 * is false even though the vault holds a perfectly good unlock, because
 * restoring from IDB is async and this is called from render paths. Anything
 * deciding whether to PROMPT must consult isUnlockAvailable() instead, or it
 * will ask for a password that isn't needed. This one is for callers that need
 * to know whether they can sign right this instant.
 */
export function isWalletUnlocked(): boolean {
  if (!sessionPrivKey) return false;

  if (unlockExpired(readUnlockedAt())) {
    lockWallet();
    return false;
  }
  return true;
}

/**
 * True when an unlock exists that this page either has or can rehydrate from
 * the vault without asking the user for anything.
 *
 * Kept synchronous on purpose: it reads only the plaintext timestamp, so the
 * UI can render "unlocked" on first paint after a refresh instead of flashing
 * a lock affordance for however long the IDB read takes.
 */
export function isUnlockAvailable(): boolean {
  if (sessionPrivKey) return isWalletUnlocked();
  const unlockedAt = readUnlockedAt();
  if (unlockedAt === null) return false;
  if (unlockExpired(unlockedAt)) {
    lockWallet();
    return false;
  }
  return true;
}

/** Synchronous accessor — null until activateWalletKey/restore has run. */
export function getEoaProvider(): IProvider | null {
  return eoaProvider;
}

/**
 * Return the EOA provider for this session, rehydrating it from the vault if
 * this page load hasn't got one yet.
 *
 * Returns null when there is genuinely nothing to restore — no vault record, an
 * unlock past the auto-lock interval, or a record for a different address —
 * and the caller falls back to the dehub:wallet-unlock-required prompt.
 */
export async function restoreWalletSession(): Promise<IProvider | null> {
  if (eoaProvider) return eoaProvider;
  // Shared so the handful of callers that race on first paint (the AuthProvider
  // effect, aa-utils resolving a signer, the AA warm-up) do one IDB read and
  // one provider build between them.
  if (hydrationPromise) return hydrationPromise;

  const unlockedAt = readUnlockedAt();
  if (unlockedAt === null) return null;
  if (unlockExpired(unlockedAt)) {
    // The interval lapsed while the page was closed. Clear rather than leave a
    // record that every later call has to re-reject.
    lockWallet();
    return null;
  }

  hydrationPromise = (async (): Promise<IProvider | null> => {
    try {
      const stored = await readVaultSession(expectedVaultAddress());
      if (!stored) return null;
      if (unlockExpired(stored.unlockedAt)) {
        lockWallet();
        return null;
      }
      const hex = normalizePrivKey(stored.privKeyHex);
      const provider = await buildProviderFromPrivKey(hex);
      sessionPrivKey = hex;
      eoaProvider = provider;
      // The vault's timestamp is authoritative — a tab that restores must not
      // silently extend the window the user configured.
      try { localStorage.setItem(UNLOCKED_AT_KEY, String(stored.unlockedAt)); } catch { /* ignore */ }
      announceLockChange();
      return provider;
    } catch (e) {
      console.warn("[SmartWallet] Could not restore persisted unlock:", e);
      return null;
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

/**
 * The address the vault record must belong to, from the ciphertext cache the
 * store keeps for returning users. Undefined when this browser has no cached
 * wallet, in which case the vault read skips the check — there is nothing to
 * disagree with.
 */
function expectedVaultAddress(): string | undefined {
  try {
    const raw = localStorage.getItem("dehub_wallet_enc");
    if (!raw) return undefined;
    return JSON.parse(raw)?.ethAddress || undefined;
  } catch {
    return undefined;
  }
}

/** Wipe all key material and providers (logout / lock), vault included. */
export function lockWallet(): void {
  sessionPrivKey = null;
  eoaProvider = null;
  hydrationPromise = null;
  storedAAProvider = null;
  pendingAASetupPromise = null;
  storedChainAAProviders.clear();
  try { localStorage.removeItem(UNLOCKED_AT_KEY); } catch { /* ignore */ }
  // Fire-and-forget: the in-memory key is already gone, so the wallet is locked
  // from this instant whether or not the IDB delete lands.
  void clearVaultSession();
  announceLockChange();
}

// ── AA provider (Safe Smart Account via Pimlico) ────────────────────────────

export function setAAProvider(provider: AccountAbstractionProvider | null): void {
  storedAAProvider = provider;
}

export function getAAProvider(): AccountAbstractionProvider | null {
  return storedAAProvider;
}

export function clearAAProvider(): void {
  storedAAProvider = null;
  pendingAASetupPromise = null;
  storedChainAAProviders.clear();
}

export function getAAProviderForChain(chainId: number): AccountAbstractionProvider | null {
  return storedChainAAProviders.get(chainId) || null;
}

/**
 * Create the Base AA provider from the unlocked wallet key.
 * Returns null if Pimlico config is unavailable or the wallet is locked
 * (AA is best-effort; callers fall back to the EOA provider).
 */
export async function setupAAProvider(_eoaProvider?: IProvider | null): Promise<AccountAbstractionProvider | null> {
  if (storedAAProvider) return storedAAProvider;
  if (pendingAASetupPromise) return pendingAASetupPromise;

  pendingAASetupPromise = _doSetupAAProvider().finally(() => {
    pendingAASetupPromise = null;
  });
  return pendingAASetupPromise;
}

async function _doSetupAAProvider(): Promise<AccountAbstractionProvider | null> {
  try {
    const signingProvider = eoaProvider ?? await restoreWalletSession();
    if (!signingProvider) {
      console.warn("[SmartWallet] AA setup skipped — wallet is locked");
      return null;
    }

    const pimlicoConfig = await getPimlicoConfig();
    if (!pimlicoConfig?.bundlerUrl || !pimlicoConfig?.paymasterUrl) {
      console.warn("[SmartWallet] Pimlico config unavailable — skipping AA setup");
      return null;
    }

    const { AccountAbstractionProvider, SafeSmartAccount } = await loadAAProvider();
    const aaProvider = await AccountAbstractionProvider.getProviderInstance({
      eoaProvider: signingProvider,
      smartAccountInit: new SafeSmartAccount(),
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: BASE_CHAIN.chainIdHex,
        rpcTarget: BASE_CHAIN.rpcTarget,
        displayName: BASE_CHAIN.displayName,
        blockExplorerUrl: BASE_CHAIN.blockExplorerUrl,
        ticker: BASE_CHAIN.ticker,
        tickerName: BASE_CHAIN.tickerName,
      },
      bundlerConfig: { url: pimlicoConfig.bundlerUrl },
      paymasterConfig: { url: pimlicoConfig.paymasterUrl },
    });

    storedAAProvider = aaProvider;
    console.log("[SmartWallet] AA provider ready (Base)");
    return aaProvider;
  } catch (e) {
    console.warn("[SmartWallet] AA provider setup failed:", e);
    return null;
  }
}

/**
 * Set up an AA provider for a specific chain (e.g. BNB = 56).
 * Derives Pimlico URLs from the cached Base config by replacing the chain ID.
 */
export async function setupAAProviderForChain(targetChainId: number): Promise<AccountAbstractionProvider | null> {
  const cached = storedChainAAProviders.get(targetChainId);
  if (cached) return cached;

  const chainInfo = AA_CHAIN_CONFIGS[targetChainId];
  if (!chainInfo) {
    console.warn("[SmartWallet] No AA chain config for chainId:", targetChainId);
    return null;
  }

  let privKey = sessionPrivKey;
  if (!privKey) {
    await restoreWalletSession();
    privKey = sessionPrivKey;
  }
  if (!privKey) {
    console.warn("[SmartWallet] Wallet locked — cannot set up chain-specific AA (chainId:", targetChainId, ")");
    return null;
  }

  const pimlicoConfig = await getPimlicoConfig();
  if (!pimlicoConfig?.bundlerUrl) {
    console.warn("[SmartWallet] Pimlico config unavailable for chain-specific AA");
    return null;
  }

  const bundlerUrl = derivePimlicoUrlForChain(pimlicoConfig.bundlerUrl, targetChainId);
  const paymasterUrl = derivePimlicoUrlForChain(pimlicoConfig.paymasterUrl, targetChainId);

  const { EthereumPrivateKeyProvider } = await loadEthProvider();
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

  const { AccountAbstractionProvider, SafeSmartAccount } = await loadAAProvider();
  const aaProvider = await AccountAbstractionProvider.getProviderInstance({
    eoaProvider: pkProvider as unknown as IProvider,
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
  console.log("[SmartWallet] Chain-specific AA provider ready for", chainInfo.displayName, `(${targetChainId})`);
  return aaProvider;
}

/** Smart Account (Safe) address for the current session, or null when locked. */
export async function getSmartAccountAddress(): Promise<string | null> {
  const aa = await setupAAProvider();
  if (!aa) return null;
  try {
    const accounts = await aa.request({ method: "eth_accounts" }) as string[];
    return accounts?.[0]?.toLowerCase() || null;
  } catch {
    return null;
  }
}
