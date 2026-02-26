import { apiCall } from './core';

export interface DPayToken {
  symbol: string;
  name: string;
  address?: string;
  chainId?: number;
  decimals?: number;
  logoUrl?: string;
  balance?: number;
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

export interface DHBPriceResponse {
  price: number;
  tokenSymbol?: string;
  currency?: string;
  /** @deprecated No longer returned by API */
  change_24h?: number;
}

export async function getDHBPrice(): Promise<DHBPriceResponse> {
  return apiCall<DHBPriceResponse>("/api/dpay/price");
}

export async function getDHBPriceByChain(chainId: number): Promise<DHBPriceResponse> {
  return apiCall<DHBPriceResponse>(`/api/dpay/price/${chainId}`);
}

export async function getAvailableTokens(): Promise<DPayToken[]> {
  const response = await apiCall<any>("/api/dpay/available/tokens");

  // New shape: { balance: { [chainId]: { [symbol]: amount } } }
  if (response && typeof response === 'object' && 'balance' in response) {
    const tokens: DPayToken[] = [];
    const balance = response.balance as Record<string, Record<string, number>>;
    for (const [chainId, symbols] of Object.entries(balance)) {
      for (const [symbol, amount] of Object.entries(symbols)) {
        tokens.push({
          symbol,
          name: symbol,
          address: '',
          chainId: Number(chainId),
          decimals: 18,
          balance: amount,
        });
      }
    }
    return tokens;
  }

  // Legacy: { result: DPayToken[] } or DPayToken[]
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return Array.isArray(response) ? response : [];
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
