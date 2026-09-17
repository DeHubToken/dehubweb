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

const pendingPayments = new Map<string, string>();

async function confirm(id: string, txHash: string): Promise<Purchase> {
  pendingPayments.set(id, txHash);
  try { localStorage.setItem(`dehub.payment.${id}`, txHash); } catch { /* Still register the broadcast payment with the server. */ }
  const receipt = await request<Purchase>('direct/confirm', { id, txHash }, true);
  if (receipt.settlement === 'DIRECT_SETTLED') {
    pendingPayments.delete(id);
    try { localStorage.removeItem(`dehub.payment.${id}`); } catch { /* The server already has the settled payment. */ }
  }
  return receipt;
}
export const cryptoPurchaseApi: PurchaseApi = {
  assets: async () => (await request<{ tokens: PaymentAsset[] }>('payment-options')).tokens,
  quote: params => request('quote', params),
  create: params => request('intent', params, true),
  list: async () => (await request<{ intents: Purchase[] }>('intents', undefined, true)).intents,
  confirm,
  status: async id => {
    let pending = pendingPayments.get(id);
    try { pending ||= localStorage.getItem(`dehub.payment.${id}`) || undefined; } catch { /* Retry from memory when browser storage is unavailable. */ }
    return pending ? confirm(id, pending) : request(`intent/${encodeURIComponent(id)}`, undefined, true);
  },
};

export const buildDirectSolanaPayment = (id: string) => request<{ transaction: string }>('direct/transaction', { id }, true);
