import { apiCall } from './core';

export interface DPayToken {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  decimals: number;
  logoUrl?: string;
}

export interface DPayTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  from: string;
  to: string;
  chainId: number;
  txHash?: string;
  status: string;
  createdAt: string;
}

export interface DPayTotal {
  totalVolume?: number;
  totalTransactions?: number;
  [key: string]: unknown;
}

export interface CheckoutSession {
  sessionId?: string;
  url?: string;
  [key: string]: unknown;
}

export async function getDHBPrice(): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>("/api/dpay/price");
}

export async function getDHBPriceByChain(chainId: number): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>(`/api/dpay/price/${chainId}`);
}

export async function getAvailableTokens(): Promise<DPayToken[]> {
  const response = await apiCall<{ result: DPayToken[] } | DPayToken[]>("/api/dpay/available/tokens");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DPayToken[];
}

export async function getAvailableGas(): Promise<Record<string, unknown>> {
  const response = await apiCall<{ result: Record<string, unknown> }>("/api/dpay/available/gas");
  return response?.result ?? response as any;
}

export async function getDPayTransactions(params: {
  page?: number;
  limit?: number;
} = {}): Promise<DPayTransaction[]> {
  const response = await apiCall<{ result: DPayTransaction[] } | DPayTransaction[]>("/api/dpay/tnxs", {
    params: { page: params.page, limit: params.limit },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DPayTransaction[];
}

export async function getDPayTotal(): Promise<DPayTotal> {
  const response = await apiCall<{ result: DPayTotal }>("/api/dpay/total");
  return response?.result ?? response as any;
}

export async function createCheckout(body: Record<string, unknown>): Promise<CheckoutSession> {
  const response = await apiCall<{ result: CheckoutSession }>("/api/dpay/checkout", {
    method: "POST",
    body,
    requiresAuth: true,
  });
  return response?.result ?? response as any;
}

export async function createDPayTicket(body: Record<string, unknown>): Promise<{ result: unknown }> {
  return apiCall<{ result: unknown }>("/api/dpay/tk", {
    method: "POST",
    body,
    requiresAuth: true,
  });
}

export async function createOnrampSession(body: Record<string, unknown>): Promise<{ result: unknown }> {
  return apiCall<{ result: unknown }>("/api/dpay/create-onramp-session", {
    method: "POST",
    body,
    requiresAuth: true,
  });
}
