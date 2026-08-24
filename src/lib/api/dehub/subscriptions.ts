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
 * Monthly cost of a set of subscriptions.
 *
 * `duration` is whole months. The old sum did `(price / duration) * 30`,
 * reading duration as days — so a 1,000 DHB monthly plan was reported as
 * 30,000 a month. Lifetime plans (0 months) are one-off purchases and are
 * excluded rather than divided by zero.
 */
export function monthlySpend(subscriptions: Subscription[]): number {
  return subscriptions.reduce((sum, sub) => {
    const months = sub.plan?.duration ?? 1;
    if (!months) return sum;
    return sum + (planPrice(sub.plan || ({} as SubscriptionPlan)) || 0) / months;
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
  const response = await apiCall<Envelope<Subscription[]>>('/api/subscription/me', {
    requiresAuth: true,
  });
  return unwrap<Subscription[]>(response, 'subscription', 'subscriptions') || [];
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
  chains: { chainId: number; token: string; price: number }[];
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
    chains: { chainId: number; token: string; price: number }[];
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

export async function isSubscribedToCreator(creatorAddress: string): Promise<boolean> {
  try {
    const subscriptions = await getMySubscriptions();
    return subscriptions.some(
      (sub) =>
        (sub.creatorAddress || sub.plan?.address || '').toLowerCase() ===
          creatorAddress.toLowerCase() && sub.isActive,
    );
  } catch {
    return false;
  }
}
