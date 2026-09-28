import { apiCall } from './core';

/**
 * Subscription tokens: a dollar balance held by DeHub, shown as tokens at
 * today's price and spent on AI generation. AI plans grant it; anyone can add
 * to it. It cannot be withdrawn, sent or traded.
 */

export interface SubscriptionCreditBalance {
  /** The dollar balance at today's price. Moves with the price; `usd` does not. */
  tokens: number;
  usd: number;
  /** Lifetime dollars added and spent. Absent from older API builds. */
  totalAddedUsd?: number;
  totalSpentUsd?: number;
  dhbPriceUsd: number;
  withdrawable: false;
  tradable: false;
  message: string;
}

/**
 * `address` is the signed-in wallet: pending top-ups are only retried for
 * the account that sent them.
 */
export async function getSubscriptionCredits(address?: string | null): Promise<SubscriptionCreditBalance | null> {
  if (address) await reconcilePendingCreditTopUps(address);
  const response = await apiCall<{ credits?: SubscriptionCreditBalance }>('/api/subscription-credits', {
    requiresAuth: true,
  });
  return response?.credits ?? null;
}

/** Where a subscription-token top-up is sent on `chainId`. */
export async function getSubscriptionCreditTopUpTarget(
  chainId: number,
): Promise<{ chainId: number; dhbToken: string; treasuryAddress: string }> {
  const response = await apiCall<{ topUp?: { chainId: number; dhbToken: string; treasuryAddress: string } }>(
    `/api/subscription-credits?chainId=${chainId}`,
    { requiresAuth: true },
  );
  if (!response?.topUp?.dhbToken || !response.topUp.treasuryAddress) {
    throw new Error('Top-ups are not available right now. Try again shortly.');
  }
  return response.topUp;
}

/**
 * Turn a mined DHB transfer into subscription tokens. The API values it at the
 * price when it landed. `pending` means the chain has not caught up; ask again.
 */
export async function claimSubscriptionCreditTopUp(
  hash: string,
  chainId: number,
): Promise<{ credited: boolean; pending?: boolean }> {
  return apiCall('/api/subscription-credits/topup', {
    method: 'POST',
    body: { hash, chainId },
    requiresAuth: true,
  });
}

// A top-up is a transfer and then a claim. If the claim is interrupted the
// DHB has already left the wallet, so the hash is kept until the API has
// credited it — never dropped on a network error, only on a final answer.
const PENDING_CREDIT_TOPUPS_KEY = 'dehub.pending-credit-topups.v1';

interface PendingCreditTopUp {
  hash: string;
  chainId: number;
  /** The account that sent it. Another profile on this device must never claim it. */
  address: string;
  /** When it was sent. A hash still unresolved after a week is given up on. */
  at: number;
}

const PENDING_TOPUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function pendingCreditTopUps(): PendingCreditTopUp[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_CREDIT_TOPUPS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storePendingCreditTopUps(items: PendingCreditTopUp[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (items.length) localStorage.setItem(PENDING_CREDIT_TOPUPS_KEY, JSON.stringify(items));
    else localStorage.removeItem(PENDING_CREDIT_TOPUPS_KEY);
  } catch {
    /* storage unavailable: the claim still ran once in the foreground */
  }
}

export function rememberPendingCreditTopUp(item: Omit<PendingCreditTopUp, 'at'>): void {
  const hash = item.hash.toLowerCase();
  storePendingCreditTopUps([
    ...pendingCreditTopUps().filter((p) => p.hash.toLowerCase() !== hash),
    { ...item, address: item.address.toLowerCase(), at: Date.now() },
  ]);
}

export function clearPendingCreditTopUp(hash: string): void {
  const lower = hash.toLowerCase();
  storePendingCreditTopUps(pendingCreditTopUps().filter((p) => p.hash.toLowerCase() !== lower));
}

/**
 * The API's final word on a hash: 400 (not a valid payment) or 409 (already
 * used). Anything else — rate limits, a proxy's 403/404, 5xx — is retried.
 */
export const FINAL_TOPUP_STATUSES = new Set([400, 409]);

async function reconcilePendingCreditTopUps(address: string): Promise<void> {
  const owner = address.toLowerCase();
  const now = Date.now();
  for (const item of pendingCreditTopUps()) {
    if (!item.at || now - item.at > PENDING_TOPUP_MAX_AGE_MS) {
      clearPendingCreditTopUp(item.hash);
      continue;
    }
    if ((item.address || '').toLowerCase() !== owner) continue;
    try {
      const result = await claimSubscriptionCreditTopUp(item.hash, item.chainId);
      if (!result?.pending) clearPendingCreditTopUp(item.hash);
    } catch (err) {
      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status && FINAL_TOPUP_STATUSES.has(status)) clearPendingCreditTopUp(item.hash);
    }
  }
}

