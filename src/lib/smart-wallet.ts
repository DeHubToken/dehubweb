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
 * Key material lives in memory + sessionStorage (tab-scoped, cleared on tab
 * close/logout). The encrypted seed at rest is protected by Argon2id + the
 * user's wallet password.
 */

import type { IProvider } from "@web3auth/base";
import type { AccountAbstractionProvider } from "@web3auth/account-abstraction-provider";
import { supabase } from "@/integrations/supabase/client";

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
const SESSION_KEY = "dehub_wallet_session"; // sessionStorage: hex privkey (tab-scoped)

let sessionPrivKey: string | null = null; // hex, no 0x prefix
let eoaProvider: IProvider | null = null;
let eoaProviderPromise: Promise<IProvider> | null = null;
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

/**
 * Activate a wallet session from a decrypted private key (post-unlock/create).
 * Builds the EOA provider and persists the key in sessionStorage so page
 * refreshes within the tab don't force a re-unlock.
 */
export async function activateWalletKey(privKey: string): Promise<IProvider> {
  const hex = normalizePrivKey(privKey);
  sessionPrivKey = hex;
  try { sessionStorage.setItem(SESSION_KEY, hex); } catch { /* private mode */ }
  eoaProvider = await buildProviderFromPrivKey(hex);
  eoaProviderPromise = null;
  return eoaProvider;
}

/** True when a decrypted key is available (memory or this tab's session). */
export function isWalletUnlocked(): boolean {
  if (sessionPrivKey) return true;
  try { return !!sessionStorage.getItem(SESSION_KEY); } catch { return false; }
}

/** Synchronous accessor — null until activateWalletKey/restore has run. */
export function getEoaProvider(): IProvider | null {
  return eoaProvider;
}

/**
 * Restore the wallet session from sessionStorage (page refresh within a tab).
 * Returns the EOA provider or null when the wallet is locked.
 */
export async function restoreWalletSession(): Promise<IProvider | null> {
  if (eoaProvider) return eoaProvider;
  if (eoaProviderPromise) return eoaProviderPromise;

  let stored: string | null = null;
  try { stored = sessionStorage.getItem(SESSION_KEY); } catch { /* ignore */ }
  if (!stored) return null;

  eoaProviderPromise = (async () => {
    sessionPrivKey = normalizePrivKey(stored!);
    eoaProvider = await buildProviderFromPrivKey(sessionPrivKey);
    return eoaProvider;
  })().finally(() => { eoaProviderPromise = null; });

  try {
    return await eoaProviderPromise;
  } catch (e) {
    console.warn("[SmartWallet] Session restore failed:", e);
    lockWallet();
    return null;
  }
}

/** Wipe all key material and providers (logout / lock). */
export function lockWallet(): void {
  sessionPrivKey = null;
  eoaProvider = null;
  eoaProviderPromise = null;
  storedAAProvider = null;
  pendingAASetupPromise = null;
  storedChainAAProviders.clear();
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
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
