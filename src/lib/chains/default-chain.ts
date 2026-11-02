/**
 * Which chain the app starts on when the user has not picked one.
 *
 * BNB Chain for everyone, with one exception: a wallet that already held
 * tokens on Base when we first looked keeps Base. The decision is made once
 * per wallet and then kept, so a Base holder does not flip to BNB after
 * spending down, and a new BNB user does not flip because some Base dust
 * arrived later. An explicit choice in Settings always wins over this.
 *
 * Device-local, keyed by wallet address, like the other chain preferences.
 */
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';

export type DefaultChainId = typeof BASE_CHAIN_ID | typeof BNB_CHAIN_ID;

export const NEW_USER_DEFAULT_CHAIN: DefaultChainId = BNB_CHAIN_ID;
export const DEFAULT_CHAIN_KEY = 'dehub_default_chain';
export const DEFAULT_CHAIN_EVENT = 'dehub-default-chain-change';

let activeWallet: string | null = null;

function readMap(): Record<string, DefaultChainId> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEFAULT_CHAIN_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function notify() {
  try { window.dispatchEvent(new Event(DEFAULT_CHAIN_EVENT)); } catch { /* no window */ }
}

/** The decision already made for a wallet, or null if we have not looked yet. */
export function getDecidedDefaultChain(wallet: string | null | undefined): DefaultChainId | null {
  if (!wallet) return null;
  const value = Number(readMap()[wallet.toLowerCase()]);
  return value === BASE_CHAIN_ID || value === BNB_CHAIN_ID ? value : null;
}

/** The signed-in wallet the default is read for. Set by DefaultChainSync. */
export function setDefaultChainWallet(wallet: string | null | undefined) {
  const next = wallet ? wallet.toLowerCase() : null;
  if (next === activeWallet) return;
  activeWallet = next;
  notify();
}

export function getDefaultChainId(): DefaultChainId {
  return getDecidedDefaultChain(activeWallet) ?? NEW_USER_DEFAULT_CHAIN;
}

/**
 * Decide from a Base balance read. Returns the chain when it was decided,
 * or null when the read was incomplete and nothing was stored.
 */
export function decideDefaultChain(
  wallet: string,
  baseTokens: ReadonlyArray<{ balance: bigint; balanceUnavailable?: boolean }>,
): DefaultChainId | null {
  const existing = getDecidedDefaultChain(wallet);
  if (existing) return existing;
  const holdsBase = baseTokens.some((t) => t.balance > 0n);
  if (!holdsBase && baseTokens.some((t) => t.balanceUnavailable)) return null;
  const chain: DefaultChainId = holdsBase ? BASE_CHAIN_ID : BNB_CHAIN_ID;
  try {
    const map = readMap();
    map[wallet.toLowerCase()] = chain;
    localStorage.setItem(DEFAULT_CHAIN_KEY, JSON.stringify(map));
  } catch { /* storage blocked: stays on the new-user default */ }
  notify();
  return chain;
}
