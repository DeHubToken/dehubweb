/**
 * COMPAT SHIM — Web3Auth has been replaced by the DeHub self-custody smart
 * wallet (see @/lib/smart-wallet and @/lib/wallet-core). This module keeps the
 * old import surface alive for existing consumers (aa-utils, wallet send,
 * FullWalletPage, LoginModal) so the migration didn't have to touch every
 * call site. New code should import from @/lib/smart-wallet directly.
 *
 * The @web3auth/modal SDK (the billed Sapphire-network part) is no longer
 * imported anywhere. Only the standalone provider packages remain in use:
 * EthereumPrivateKeyProvider (local signing) and AccountAbstractionProvider
 * (Safe smart account via Pimlico) — neither contacts Web3Auth's auth network.
 */

import type { IProvider } from "@web3auth/base";
import { supabase } from "@/integrations/supabase/client";
import {
  getEoaProvider,
  restoreWalletSession,
  isWalletUnlocked,
} from "@/lib/smart-wallet";

// AA provider surface — unchanged API, new implementation.
export {
  setupAAProvider,
  setAAProvider,
  getAAProvider,
  clearAAProvider,
  getAAProviderForChain,
  setupAAProviderForChain,
} from "@/lib/smart-wallet";

/**
 * Detect if running on a mobile device based on user agent + touch support.
 * iPadOS 13+ reports a desktop UA, so we also check maxTouchPoints.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
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
  // Phantom injects window.phantom.ethereum in BOTH its mobile DApp browser and
  // its desktop extension. Only treat it as in-app when actually on mobile.
  const hasPhantomEthereum = !!win.phantom?.ethereum;
  if (hasPhantomEthereum && isMobileDevice()) return true;

  const walletUAs = [
    'metamask', 'rabby', 'trust', 'trustwallet', 'coinbasebrowser', 'coinbase',
    'phantom', 'tokenpocket', 'imtoken', 'bitkeep', 'okex', 'okapp',
  ];
  const isKnownWalletUA = walletUAs.some(w => ua.includes(w));

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

  if (isMobileDevice() && ethereum) return 'Wallet';
  return null;
}

/**
 * Generate a universal link to open the current site inside a wallet's in-app browser.
 */
export function getWalletDeepLink(wallet: string, targetUrl?: string): string | null {
  if (typeof window === 'undefined') return null;

  const url = targetUrl || window.location.href;
  const encodedUrl = encodeURIComponent(url);
  const domainAndPath = url.replace(/^https?:\/\//, '');
  const ref = encodeURIComponent(window.location.origin);

  switch (wallet.toLowerCase()) {
    case 'metamask':
      return `https://metamask.app.link/dapp/${domainAndPath}`;
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${ref}`;
    case 'coinbase':
      return `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`;
    case 'trust':
      return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedUrl}`;
    case 'rabby':
      return null;
    default:
      return null;
  }
}

// ── Session compat wrappers ─────────────────────────────────────────────────

/** Old API: raw Web3Auth EOA provider. Now: the smart-wallet EOA provider. */
export function getWeb3AuthProvider(): IProvider | null {
  return getEoaProvider();
}

/** Old API: is a Web3Auth session live. Now: is the smart wallet unlocked. */
export function isWeb3AuthConnected(): boolean {
  return isWalletUnlocked();
}

interface CompatSession {
  connected: boolean;
  provider: IProvider | null;
  getUserInfo: () => Promise<Record<string, unknown>>;
}

/**
 * Old API: lazily init Web3Auth and return the instance. Now: restore the
 * smart-wallet session (sessionStorage → provider) and return a minimal
 * object with the fields callers actually use (connected / provider /
 * getUserInfo).
 */
export async function getOrInitWeb3Auth(): Promise<CompatSession> {
  const provider = getEoaProvider() ?? await restoreWalletSession();
  return {
    connected: !!provider,
    provider,
    async getUserInfo() {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        if (!u) return {};
        return {
          email: u.email ?? undefined,
          name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? undefined,
          typeOfLogin: u.app_metadata?.provider ?? 'email',
          verifierId: u.id,
        };
      } catch {
        return {};
      }
    },
  };
}

/**
 * Old API: refresh the Web3Auth provider after a keyring error. Now: rebuild
 * the EOA provider from the tab session; null when the wallet is locked.
 */
export async function refreshWeb3AuthProvider(): Promise<IProvider | null> {
  return restoreWalletSession();
}

/** Fiat on-ramp was a Web3Auth Wallet Services feature — no longer available. */
export async function showWeb3AuthCheckout(): Promise<void> {
  throw new Error("Fiat on-ramp is temporarily unavailable. Please try again later.");
}
