import { getAuthToken } from './dehub';
import type { PurchaseApi } from '@/hooks/use-crypto-purchase';
import type { PaymentAsset, Purchase } from '@/lib/crypto-purchase';

async function request<T>(path: string, body?: unknown, authenticated = false): Promise<T> {
  const token = authenticated ? getAuthToken() : null;
  if (authenticated && !token) throw new Error('Please sign in again to view your purchase.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch(`https://api.dehub.io/api/dpay/crypto/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || 'Could not load this purchase. Please retry.');
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The connection timed out. Check your saved purchases before trying again.');
    throw error;
  } finally { clearTimeout(timer); }
}

export const cryptoPurchaseApi: PurchaseApi = {
  assets: async () => (await request<{ tokens: PaymentAsset[] }>('tokens')).tokens,
  quote: params => request('quote', params),
  create: params => request('intent', params, true),
  list: async () => (await request<{ intents: Purchase[] }>('intents', undefined, true)).intents,
  status: id => request(`intent/${encodeURIComponent(id)}`, undefined, true),
};
