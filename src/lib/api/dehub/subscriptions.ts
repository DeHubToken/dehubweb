import { apiCall } from './core';

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
  price?: number;
  currency?: string;
  duration: number;
  tier?: number;
  benefits?: string[];
  chains?: SubscriptionPlanChain[];
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
  autoRenew?: boolean;
  transactionHash?: string;
  createdAt?: string;
}

export async function getPlan(planId: string): Promise<SubscriptionPlan> {
  const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>(`/api/plans/${planId}`);
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as SubscriptionPlan;
}

export async function getPlans(creatorAddress?: string): Promise<SubscriptionPlan[]> {
  const response = await apiCall<{ result: SubscriptionPlan[] } | SubscriptionPlan[]>("/api/plans", {
    params: creatorAddress ? { creator: creatorAddress } : {},
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

export async function getMyPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiCall<{ result: SubscriptionPlan[] } | SubscriptionPlan[]>("/api/plans", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  const response = await apiCall<{ result: Subscription[] } | Subscription[]>("/api/subscription/me", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

export async function getSubscription(subscriptionId: string): Promise<Subscription> {
  const response = await apiCall<{ result: Subscription } | Subscription>(`/api/subscription/${subscriptionId}`, {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as Subscription;
}

export async function createPlan(planData: {
  name: string;
  description?: string;
  duration: number;
  tier: number;
  benefits?: string[];
  chains: { chainId: number; token: string; price: number }[];
}): Promise<SubscriptionPlan> {
  console.log('[createPlan] Sending request with data:', JSON.stringify(planData));
  try {
    const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>("/api/plans", {
      method: "POST",
      body: planData,
      requiresAuth: true,
    });
    console.log('[createPlan] Success response:', JSON.stringify(response));
    if (response && typeof response === 'object' && 'result' in response) {
      return response.result;
    }
    return response as SubscriptionPlan;
  } catch (err) {
    console.error('[createPlan] API error:', err);
    throw err;
  }
}

export async function updatePlan(
  planId: string, 
  planData: Partial<{
    name: string;
    description: string;
    price: number;
    currency: string;
    duration: number;
    benefits: string[];
    isActive: boolean;
  }>
): Promise<SubscriptionPlan> {
  const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>(`/api/plans/${planId}`, {
    method: "POST",
    body: planData,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as SubscriptionPlan;
}

export async function buyPlan(planId: string): Promise<{ subscription: Subscription; transactionHash?: string }> {
  const response = await apiCall<{ result: { subscription: Subscription; transactionHash?: string } } | { subscription: Subscription; transactionHash?: string }>("/api/plan/buy", {
    method: "POST",
    body: { planId },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as { subscription: Subscription; transactionHash?: string };
}

export async function isSubscribedToCreator(creatorAddress: string): Promise<boolean> {
  try {
    const subscriptions = await getMySubscriptions();
    return subscriptions.some(
      sub => sub.creatorAddress.toLowerCase() === creatorAddress.toLowerCase() && sub.isActive
    );
  } catch {
    return false;
  }
}
