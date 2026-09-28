import { apiCall } from './core';

/**
 * Creator subscription plans.
 *
 * Every function here used to unwrap `{ result: … }` or a bare array. The API
 * returns neither — it answers `{ plans: [...] }`, `{ plan: … }` and
 * `{ subscription: [...] }`. So the unwrap fell through to its
 * `Array.isArray(response) ? response : []` fallback and handed back an empty
 * list on every single call, no matter what the server said. That is why no
 * plan has ever rendered on a profile and why "am I subscribed" has always
 * answered no.
 *
 * `unwrap` below reads the real keys and still tolerates `result`/array, so a
 * future response-shape change does not silently empty the UI again.
 */

export interface SubscriptionPlanChain {
  chainId: number;
  token: string;
  price: number;
  currency?: string;
  decimals?: number;
  isPublished?: boolean;
  status?: boolean;
}

export interface SubscriptionPlan {
  _id?: string;
  id?: string;
  address?: string;
  creatorAddress?: string;
  name: string;
  description?: string;
  /** Headline price, mirrored from the primary chain entry. */
  price?: number;
  currency?: string;
  decimals?: number;
  /** Whole months. 0 is lifetime — see normaliseDuration in lib/contracts. */
  duration: number;
  tier?: number;
  benefits?: string[];
  chains?: SubscriptionPlanChain[];
  /** Chain the headline price belongs to. */
  chainId?: number;
  token?: string;
  /** True once the creator has listed the plan on chain and it can be bought. */
  isPublished?: boolean;
  isLifetime?: boolean;
  durationLabel?: string;
  isActive?: boolean;
  subscriberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subscription {
  _id?: string;
  id?: string;
  planId: string;
  plan?: SubscriptionPlan;
  subscriberAddress: string;
  creatorAddress: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isLifetime?: boolean;
  chainId?: number;
  autoRenew?: boolean;
  transactionHash?: string;
  createdAt?: string;
}

/** Intent returned by `/plan/buy` — everything the on-chain call needs. */
export interface SubscriptionIntent {
  id: string;
  planId: string;
  creatorAddress: string;
  subscriberAddress: string;
  duration: number;
  chainId: number;
  token: string;
  price: number;
  currency: string;
  decimals?: number;
  settlementMode?: 'onchain_usdt' | 'dhb_custody' | 'credits';
  dhbToken?: string;
  treasuryAddress?: string;
  dhbAmount?: number;
  dhbAmountWei?: string;
  usdtCredit?: number;
  quoteExpiresAt?: string;
  /** Subscription-token checkout. Absent from older API builds. */
  credits?: SubscriptionCreditQuote;
}

/**
 * Subscription tokens: DHB held by DeHub and locked at its dollar value when
 * it was added. Shown as tokens, spent on subscriptions, never withdrawn or
 * traded.
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

export interface SubscriptionCreditQuote {
  priceUsd: number;
  priceTokens: number;
  balanceTokens: number;
  balanceUsd: number;
  tokensFromBalance: number;
  shortfallUsd: number;
  dhbPriceUsd: number;
  topUp: {
    chainId: number;
    dhbAmount: number;
    dhbAmountWei: string;
    dhbToken: string;
    treasuryAddress: string;
  } | null;
  message: string;
}

/**
 * A creator's earnings. Held in dollars, paid out in tokens at the price on
 * the day: the token count moves with the price, the value does not.
 * The `*Usdt` fields are dollar values kept under their old names.
 */
export interface SubscriptionEarnings {
  currency: 'USDT' | 'DHB';
  dhbPriceUsd?: number;
  pendingTokens?: number;
  processingTokens?: number;
  payoutChainId: number;
  pendingUsdt: number;
  processingUsdt: number;
  paidUsdt: number;
  totalEarnedUsdt: number;
  reserveCovered: boolean;
  withdrawalAvailable: boolean;
  withdrawalMessage: string | null;
}

interface PendingSubscriptionPayment {
  subId: string;
  hash: string;
  chainId: number;
  /** Settled through subscription tokens rather than the direct transfer. */
  mode?: 'credits';
}

const PENDING_SUBSCRIPTION_PAYMENTS_KEY = 'dehub.pending-subscription-payments.v1';

function pendingSubscriptionPayments(): PendingSubscriptionPayment[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_SUBSCRIPTION_PAYMENTS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function storePendingSubscriptionPayments(payments: PendingSubscriptionPayment[]): void {
  if (typeof window === 'undefined') return;
  if (payments.length) {
    localStorage.setItem(PENDING_SUBSCRIPTION_PAYMENTS_KEY, JSON.stringify(payments));
  } else {
    localStorage.removeItem(PENDING_SUBSCRIPTION_PAYMENTS_KEY);
  }
}

export function rememberPendingSubscriptionPayment(payment: PendingSubscriptionPayment): void {
  const payments = pendingSubscriptionPayments().filter((item) => item.subId !== payment.subId);
  storePendingSubscriptionPayments([...payments, payment]);
}

export function clearPendingSubscriptionPayment(subId: string): void {
  storePendingSubscriptionPayments(
    pendingSubscriptionPayments().filter((payment) => payment.subId !== subId),
  );
}

/**
 * Finish any checkout whose DHB transfer succeeded while the confirmation
 * request was interrupted. This runs before subscription reads, so reopening
 * the app credits the existing transfer instead of asking for another one.
 */
export async function reconcilePendingSubscriptionPayments(): Promise<void> {
  const payments = pendingSubscriptionPayments();
  for (const payment of payments) {
    try {
      if (payment.mode === 'credits') {
        await payPlanWithCredits(payment.subId, payment.hash, payment.chainId);
      } else {
        await confirmSubscriptionPurchase(payment.subId, payment.hash, payment.chainId);
      }
      clearPendingSubscriptionPayment(payment.subId);
    } catch {
      // Keep it for the next authenticated read. The backend is idempotent,
      // and a failed confirmation must never result in a second DHB payment.
    }
  }
}

type Envelope<T> = Record<string, unknown> | T;

function unwrap<T>(response: Envelope<T>, ...keys: string[]): T | undefined {
  if (response === null || response === undefined) return undefined;
  if (Array.isArray(response)) return response as unknown as T;
  if (typeof response !== 'object') return response as T;
  const obj = response as Record<string, unknown>;
  for (const key of [...keys, 'result', 'data']) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) return obj[key] as T;
  }
  return undefined;
}

/**
 * The primary chain entry for a plan — the one a purchase should target.
 * Prefers a chain the creator has actually published on, because an
 * unpublished one reverts.
 */
export function primaryPlanChain(plan: SubscriptionPlan): SubscriptionPlanChain | undefined {
  const chains = plan.chains || [];
  return chains.find((c) => c.isPublished) || chains[0];
}

/** Headline price, from whichever source the server gave us. */
export function planPrice(plan: SubscriptionPlan): number | undefined {
  if (typeof plan.price === 'number') return plan.price;
  return primaryPlanChain(plan)?.price;
}

export function isPlanPublished(plan: SubscriptionPlan): boolean {
  if (typeof plan.isPublished === 'boolean') return plan.isPublished;
  return (plan.chains || []).some((c) => c.isPublished);
}

/**
 * Is this subscription actually live right now?
 *
 * `isActive` alone is not enough for an old row, and `new Date(undefined)` is
 * an Invalid Date that every comparison quietly answers `false` to — so an
 * unconfirmed purchase with no dates read as "not expired" and counted as
 * active.
 */
export function isLiveSubscription(sub: Subscription): boolean {
  if (!sub.isActive) return false;
  if (sub.isLifetime) return true;
  const end = sub.endDate ? new Date(sub.endDate) : null;
  if (!end || Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/**
 * Monthly USD cost of a set of subscriptions. Stablecoin plans are already
 * dollar-denominated; legacy DHB plans use the current DHB/USD quote.
 *
 * `duration` is whole months. The old sum did `(price / duration) * 30`,
 * reading duration as days — so a 1,000 DHB monthly plan was reported as
 * 30,000 a month. Lifetime plans (0 months) are one-off purchases and are
 * excluded rather than divided by zero.
 */
export function monthlySpend(subscriptions: Subscription[], dhbUsd = 0): number {
  return subscriptions.reduce((sum, sub) => {
    const months = sub.plan?.duration ?? 1;
    if (!months) return sum;
    const plan = sub.plan || ({} as SubscriptionPlan);
    const monthlyPrice = (planPrice(plan) || 0) / months;
    const currency = (primaryPlanChain(plan)?.currency || plan.currency || 'DHB').toUpperCase();
    return sum + (currency === 'DHB' ? monthlyPrice * dhbUsd : monthlyPrice);
  }, 0);
}

export async function getPlan(planId: string): Promise<SubscriptionPlan | undefined> {
  const response = await apiCall<Envelope<SubscriptionPlan>>(`/api/plans/${planId}`);
  return unwrap<SubscriptionPlan>(response, 'plan');
}

export async function getPlans(creatorAddress?: string): Promise<SubscriptionPlan[]> {
  const response = await apiCall<Envelope<SubscriptionPlan[]>>('/api/plans', {
    // Lowercased because plan addresses are stored lowercased; a checksummed
    // address matches nothing.
    params: creatorAddress ? { creator: creatorAddress.toLowerCase() } : {},
  });
  return unwrap<SubscriptionPlan[]>(response, 'plans') || [];
}

export async function getMyPlans(creatorAddress: string): Promise<SubscriptionPlan[]> {
  // `GET /api/plans` carries no auth guard, so it cannot infer "mine" from a
  // bearer token — without an address it returns every plan on the platform.
  // The caller has to say whose.
  return getPlans(creatorAddress);
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  await reconcilePendingSubscriptionPayments();
  const response = await apiCall<Envelope<Subscription[]>>('/api/subscription/me', {
    requiresAuth: true,
  });
  return unwrap<Subscription[]>(response, 'subscription', 'subscriptions') || [];
}

export async function getSubscriptionEarnings(): Promise<SubscriptionEarnings> {
  const response = await apiCall<Envelope<SubscriptionEarnings>>('/api/subscription/earnings', {
    requiresAuth: true,
  });
  return unwrap<SubscriptionEarnings>(response, 'earnings') || {
    currency: 'USDT',
    payoutChainId: 8453,
    pendingUsdt: 0,
    processingUsdt: 0,
    paidUsdt: 0,
    totalEarnedUsdt: 0,
    reserveCovered: false,
    withdrawalAvailable: false,
    withdrawalMessage: 'Subscription fees will be withdrawable soon',
  };
}

export async function withdrawSubscriptionEarnings(): Promise<{
  success: true;
  amountUsdt: number;
  amountTokens?: number;
  txHash: string;
  status: SubscriptionEarnings;
}> {
  return apiCall('/api/subscription/earnings/withdraw', {
    method: 'POST',
    body: {},
    requiresAuth: true,
  });
}

export async function getSubscription(subscriptionId: string): Promise<Subscription | undefined> {
  const response = await apiCall<Envelope<Subscription>>(`/api/subscription/${subscriptionId}`, {
    requiresAuth: true,
  });
  return unwrap<Subscription>(response, 'subscription');
}

export async function createPlan(planData: {
  name: string;
  description?: string;
  duration: number;
  tier: number;
  benefits?: string[];
  chains: { chainId: number; token: string; price: number; currency?: string; decimals?: number }[];
}): Promise<SubscriptionPlan | undefined> {
  const response = await apiCall<Envelope<SubscriptionPlan>>('/api/plans', {
    method: 'POST',
    body: planData,
    requiresAuth: true,
  });
  return unwrap<SubscriptionPlan>(response, 'plan');
}

export async function updatePlan(
  planId: string,
  planData: Partial<{
    name: string;
    description: string;
    price: number;
    duration: number;
    benefits: string[];
    chains: { chainId: number; token: string; price: number; currency?: string; decimals?: number }[];
  }>,
): Promise<SubscriptionPlan | undefined> {
  const response = await apiCall<Envelope<SubscriptionPlan>>(`/api/plans/${planId}`, {
    method: 'POST',
    body: planData,
    requiresAuth: true,
  });
  return unwrap<SubscriptionPlan>(response, 'plan');
}

/**
 * Reserve the row a purchase settles against.
 *
 * This does **not** subscribe anyone — it returns an inactive intent. Only an
 * on-chain purchase followed by `confirmSubscriptionPurchase` activates it.
 * The old code called this and toasted "Subscribed successfully!", which is
 * why the system looked like it worked while never taking a payment.
 */
export async function buyPlan(
  planId: string,
  chainId?: number,
): Promise<SubscriptionIntent | undefined> {
  const response = await apiCall<Envelope<SubscriptionIntent>>('/api/plan/buy', {
    method: 'POST',
    body: { planId, ...(chainId ? { chainId } : {}) },
    requiresAuth: true,
  });
  return unwrap<SubscriptionIntent>(response, 'data', 'subscription');
}

/** Tell the API a plan is now listed on chain, so it can verify and publish it. */
export async function confirmPlanPublished(planId: string, chainId: number): Promise<void> {
  await apiCall('/api/plan/webhook/create', {
    method: 'POST',
    body: { planId, chainId, isSuccess: true },
    requiresAuth: true,
  });
}

/** Tell the API a purchase landed, so it can verify it against the chain. */
export async function confirmSubscriptionPurchase(
  subId: string,
  hash: string,
  chainId: number,
): Promise<void> {
  await apiCall('/api/plan/webhook/purchased', {
    method: 'POST',
    body: { subId, hash, chainId, isSuccess: true },
    requiresAuth: true,
  });
}

/**
 * Settle an intent from subscription tokens. `hash` is the DHB top-up sent
 * for any shortfall; the API credits it at the price when it landed first.
 */
export async function payPlanWithCredits(subId: string, hash?: string, chainId?: number): Promise<void> {
  await apiCall('/api/plan/buy/credits', {
    method: 'POST',
    body: { subId, ...(hash ? { hash } : {}), ...(chainId ? { chainId } : {}) },
    requiresAuth: true,
  });
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

export async function isSubscribedToCreator(creatorAddress: string): Promise<boolean> {
  try {
    const subscriptions = await getMySubscriptions();
    return subscriptions.some(
      (sub) =>
        (sub.creatorAddress || sub.plan?.address || '').toLowerCase() ===
          creatorAddress.toLowerCase() &&
        // isLiveSubscription, not isActive — the reason is written above it.
        // This is what the gate drawer reads to decide whether to unlock and
        // show "Subscribed", so on `isActive` alone a lapsed subscriber kept
        // both, and an unconfirmed purchase with no end date counted too.
        isLiveSubscription(sub),
    );
  } catch {
    return false;
  }
}

/** Unwithdrawn earnings, in dollars and in tokens at today's price. */
export function outstandingEarnings(earnings: SubscriptionEarnings | undefined): { usd: number; tokens: number } {
  const usd = (earnings?.pendingUsdt || 0) + (earnings?.processingUsdt || 0);
  // 0.001 is the pre-listing peg (DHB_PRELISTING_USD). Not imported: that module pulls in i18n.
  const price = earnings?.dhbPriceUsd || 0.001;
  const tokens =
    earnings?.pendingTokens !== undefined
      ? (earnings.pendingTokens || 0) + (earnings.processingTokens || 0)
      : usd / price;
  return { usd, tokens };
}
